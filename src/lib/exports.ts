import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from './supabase'
import type { Profile } from '@/types/database'

interface EvalRow {
  id: string
  title: string
  subject: string
  eval_date: string
  coefficient: number
  max_score: number
  type: string
}

interface GradeRow {
  student_id: string
  evaluation_id: string
  score: number | null
  is_absent: boolean
}

interface StudentRow {
  id: string
  last_name: string
  first_name: string
}

interface RankingRow {
  student_id: string
  average: number | null
  rank: number
}

async function fetchClassData(classId: string) {
  const [studentsRes, evaluationsRes, rankingsRes] = await Promise.all([
    supabase.from('students').select('id, last_name, first_name').eq('class_id', classId).eq('is_active', true).order('last_name'),
    supabase.from('evaluations').select('id, title, subject, eval_date, coefficient, max_score, type').eq('class_id', classId).order('eval_date'),
    supabase.from('student_rankings').select('student_id, average, rank').eq('class_id', classId)
  ])

  const students = (studentsRes.data as StudentRow[]) ?? []
  const evaluations = (evaluationsRes.data as EvalRow[]) ?? []
  const rankings = (rankingsRes.data as RankingRow[]) ?? []

  const evaluationIds = evaluations.map((e) => e.id)
  let grades: GradeRow[] = []
  if (evaluationIds.length > 0) {
    const gradesRes = await supabase
      .from('grades')
      .select('student_id, evaluation_id, score, is_absent')
      .in('evaluation_id', evaluationIds)
    grades = (gradesRes.data as GradeRow[]) ?? []
  }

  return { students, evaluations, grades, rankings }
}

function getEnTete(profile: Profile | null, className: string) {
  const anneeScolaire = new Date().getMonth() >= 8
    ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
    : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`
  return {
    ecole: profile?.school_name?.trim() || 'Établissement scolaire',
    annee: anneeScolaire,
    classe: className,
    enseignant: profile?.full_name ?? ''
  }
}

export async function exportClassExcel(classId: string, className: string, profile: Profile | null) {
  const { students, evaluations, grades, rankings } = await fetchClassData(classId)
  const entete = getEnTete(profile, className)

  const rankingByStudent = new Map(rankings.map((r) => [r.student_id, r]))
  const gradeByKey = new Map(grades.map((g) => [`${g.student_id}_${g.evaluation_id}`, g]))

  // Interrogations d'abord, puis devoirs : chaque groupe a sa propre moyenne
  const interroEvals = evaluations.filter((e) => e.type === 'interrogation')
  const devoirEvals = evaluations.filter((e) => e.type !== 'interrogation')

  const headerRow = [
    'Nom',
    'Prénom',
    ...interroEvals.map((e) => `${e.title} (${e.subject})`),
    ...(interroEvals.length > 0 ? ['Moy. interrogations /20'] : []),
    ...devoirEvals.map((e) => `${e.title} (${e.subject})`),
    ...(devoirEvals.length > 0 ? ['Moy. devoirs /20'] : []),
    'Moyenne générale /20',
    'Rang'
  ]

  /** Moyenne pondérée sur 20 d'un élève pour un groupe d'évaluations ('' si aucune note). */
  const groupAverage = (studentId: string, group: EvalRow[]): number | string => {
    let total = 0
    let coefficients = 0
    for (const ev of group) {
      const g = gradeByKey.get(`${studentId}_${ev.id}`)
      if (!g || g.is_absent || g.score == null) continue
      total += (g.score / ev.max_score) * 20 * ev.coefficient
      coefficients += ev.coefficient
    }
    return coefficients > 0 ? Math.round((total / coefficients) * 100) / 100 : ''
  }

  const gradeCell = (studentId: string, ev: EvalRow): string | number => {
    const g = gradeByKey.get(`${studentId}_${ev.id}`)
    return g?.is_absent ? 'ABS' : g?.score != null ? g.score : ''
  }

  const dataRows = students.map((s) => {
    const row: (string | number)[] = [s.last_name, s.first_name]
    for (const ev of interroEvals) row.push(gradeCell(s.id, ev))
    if (interroEvals.length > 0) row.push(groupAverage(s.id, interroEvals))
    for (const ev of devoirEvals) row.push(gradeCell(s.id, ev))
    if (devoirEvals.length > 0) row.push(groupAverage(s.id, devoirEvals))
    const ranking = rankingByStudent.get(s.id)
    row.push(ranking?.average ?? '')
    row.push(ranking?.rank ?? '')
    return row
  })

  const sheet = XLSX.utils.aoa_to_sheet([
    [entete.ecole],
    [`Relevé de notes — Classe ${entete.classe} — Année scolaire ${entete.annee}`],
    [`Enseignant(e) : ${entete.enseignant}`],
    [],
    headerRow,
    ...dataRows
  ])

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Relevé de notes')
  XLSX.writeFile(workbook, `Releve_${className.replace(/\s+/g, '_')}.xlsx`)
}

async function buildBulletinDoc(
  studentId: string,
  studentName: string,
  classId: string,
  className: string,
  profile: Profile | null
) {
  const { evaluations, grades, rankings } = await fetchClassData(classId)
  const entete = getEnTete(profile, className)
  const studentGrades = grades.filter((g) => g.student_id === studentId)
  const gradeByEval = new Map(studentGrades.map((g) => [g.evaluation_id, g]))
  const ranking = rankings.find((r) => r.student_id === studentId)

  const doc = new jsPDF()

  doc.setFontSize(14)
  doc.setTextColor(30, 58, 95)
  doc.text(entete.ecole, 105, 18, { align: 'center' })
  doc.setFontSize(11)
  doc.setTextColor(80, 80, 80)
  doc.text(`Année scolaire ${entete.annee}`, 105, 25, { align: 'center' })

  doc.setFontSize(16)
  doc.setTextColor(20, 20, 20)
  doc.text('Bulletin de notes', 105, 38, { align: 'center' })

  doc.setFontSize(11)
  doc.text(`Élève : ${studentName}`, 14, 50)
  doc.text(`Classe : ${entete.classe}`, 14, 57)

  const rows = evaluations.map((ev) => {
    const g = gradeByEval.get(ev.id)
    const note = g?.is_absent ? 'Absent(e)' : g?.score != null ? `${g.score}/${ev.max_score}` : '—'
    return [ev.title, ev.subject, new Date(ev.eval_date).toLocaleDateString('fr-FR'), String(ev.coefficient), note]
  })

  autoTable(doc, {
    startY: 65,
    head: [['Évaluation', 'Matière', 'Date', 'Coeff.', 'Note']],
    body: rows,
    headStyles: { fillColor: [30, 58, 95] },
    styles: { fontSize: 10 }
  })

  const finalY = (doc as any).lastAutoTable?.finalY ?? 65
  doc.setFontSize(12)
  doc.text(`Moyenne générale : ${ranking?.average ?? '—'}/20`, 14, finalY + 12)
  doc.text(`Classement : ${ranking?.rank ?? '—'}`, 14, finalY + 19)

  doc.setFontSize(10)
  doc.text(`Fait le ${new Date().toLocaleDateString('fr-FR')}`, 14, finalY + 35)
  doc.text(`${entete.enseignant}`, 150, finalY + 35)
  doc.text('Signature de l\'enseignant(e)', 150, finalY + 40)

  return doc
}

export async function exportStudentBulletinPDF(
  studentId: string,
  studentName: string,
  classId: string,
  className: string,
  profile: Profile | null
) {
  const doc = await buildBulletinDoc(studentId, studentName, classId, className, profile)
  doc.save(`Bulletin_${studentName.replace(/\s+/g, '_')}.pdf`)
}

export async function getStudentBulletinBlob(
  studentId: string,
  studentName: string,
  classId: string,
  className: string,
  profile: Profile | null
): Promise<{ blob: Blob; fileName: string }> {
  const doc = await buildBulletinDoc(studentId, studentName, classId, className, profile)
  const blob = doc.output('blob')
  return { blob, fileName: `Bulletin_${studentName.replace(/\s+/g, '_')}.pdf` }
}

export async function exportClassBulletinsPDF(classId: string, className: string, profile: Profile | null) {
  const { students, evaluations, grades, rankings } = await fetchClassData(classId)
  const entete = getEnTete(profile, className)
  const rankingByStudent = new Map(rankings.map((r) => [r.student_id, r]))

  const doc = new jsPDF()

  students.forEach((student, index) => {
    if (index > 0) doc.addPage()

    const studentGrades = grades.filter((g) => g.student_id === student.id)
    const gradeByEval = new Map(studentGrades.map((g) => [g.evaluation_id, g]))
    const ranking = rankingByStudent.get(student.id)

    doc.setFontSize(14)
    doc.setTextColor(30, 58, 95)
    doc.text(entete.ecole, 105, 18, { align: 'center' })
    doc.setFontSize(11)
    doc.setTextColor(80, 80, 80)
    doc.text(`Année scolaire ${entete.annee}`, 105, 25, { align: 'center' })

    doc.setFontSize(16)
    doc.setTextColor(20, 20, 20)
    doc.text('Bulletin de notes', 105, 38, { align: 'center' })

    doc.setFontSize(11)
    doc.text(`Élève : ${student.last_name} ${student.first_name}`, 14, 50)
    doc.text(`Classe : ${entete.classe}`, 14, 57)

    const rows = evaluations.map((ev) => {
      const g = gradeByEval.get(ev.id)
      const note = g?.is_absent ? 'Absent(e)' : g?.score != null ? `${g.score}/${ev.max_score}` : '—'
      return [ev.title, ev.subject, new Date(ev.eval_date).toLocaleDateString('fr-FR'), String(ev.coefficient), note]
    })

    autoTable(doc, {
      startY: 65,
      head: [['Évaluation', 'Matière', 'Date', 'Coeff.', 'Note']],
      body: rows,
      headStyles: { fillColor: [30, 58, 95] },
      styles: { fontSize: 10 }
    })

    const finalY = (doc as any).lastAutoTable?.finalY ?? 65
    doc.setFontSize(12)
    doc.text(`Moyenne générale : ${ranking?.average ?? '—'}/20`, 14, finalY + 12)
    doc.text(`Classement : ${ranking?.rank ?? '—'}`, 14, finalY + 19)

    doc.setFontSize(10)
    doc.text(`Fait le ${new Date().toLocaleDateString('fr-FR')}`, 14, finalY + 35)
    doc.text(`${entete.enseignant}`, 150, finalY + 35)
    doc.text('Signature de l\'enseignant(e)', 150, finalY + 40)
  })

  doc.save(`Bulletins_${className.replace(/\s+/g, '_')}.pdf`)
}
