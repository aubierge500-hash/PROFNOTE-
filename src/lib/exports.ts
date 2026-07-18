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
  doc.setTextColor(30, 58, 95) // primary-600
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
