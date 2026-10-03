import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  Users,
  ClipboardList,
  BarChart3,
  FileText,
  MessageCircle,
  Settings,
  X,
  Save,
  Upload,
  Trash2,
  ClipboardPaste
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import ClassWhatsAppSendButton from '@/components/ClassWhatsAppSendButton'
import PhotoImportButton from '@/components/PhotoImportButton'

import {
  insertImportedStudents,
  type ImportedRow
} from '@/lib/studentImport'

import {
  parseStudentsFile,
  type ImportResult
} from '@/lib/importStudentsFile'

import type {
  SchoolClass,
  Student,
  Evaluation,
  EvaluationType,
  Grade
} from '@/types/database'

type ClassSection =
  | 'eleves'
  | 'evaluations'
  | 'resultats'
  | 'bulletins'
  | 'communication'
  | 'parametres'

type GradeMap = Record<string, Grade>

type StudentResult = {
  student: Student
  average: number | null
  rank: number | null
  graded: number
  missing: number
  absent: number
}

export default function ClassDetail() {
  const { classId } = useParams<{ classId: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [schoolClass, setSchoolClass] =
    useState<SchoolClass | null>(null)

  const [students, setStudents] =
    useState<Student[]>([])

  const [evaluations, setEvaluations] =
    useState<Evaluation[]>([])

  const [selectedEvaluation, setSelectedEvaluation] =
    useState<Evaluation | null>(null)

  const [grades, setGrades] =
    useState<GradeMap>({})

  const [allGrades, setAllGrades] =
    useState<GradeMap>({})

  const [draftScores, setDraftScores] =
    useState<Record<string, string>>({})

  const [draftAbsences, setDraftAbsences] =
    useState<Record<string, boolean>>({})

  const [activeSection, setActiveSection] =
    useState<ClassSection>('eleves')

  const [loading, setLoading] =
    useState(true)

  const [loadingGrades, setLoadingGrades] =
    useState(false)

  const [loadingGradebook, setLoadingGradebook] =
    useState(false)

  const [savingAllGrades, setSavingAllGrades] =
    useState(false)

  const [errorMessage, setErrorMessage] =
    useState('')

  const [gradesSavedMessage, setGradesSavedMessage] =
    useState('')

  const [showEvaluationForm, setShowEvaluationForm] =
    useState(false)

  const [savingEvaluation, setSavingEvaluation] =
    useState(false)

  const [evaluationForm, setEvaluationForm] = useState({
    title: '',
    type: 'interrogation' as EvaluationType,
    subject: '',
    eval_date: new Date().toISOString().slice(0, 10),
    coefficient: 1,
    max_score: 20
  })

  /* =========================
     GESTION DES ÉLÈVES
     ========================= */

  const [showStudentForm, setShowStudentForm] =
    useState(false)

  const [studentForm, setStudentForm] = useState({
    last_name: '',
    first_name: '',
    gender: '',
    parent_whatsapp: ''
  })

  const [showPasteImport, setShowPasteImport] =
    useState(false)

  const [pasteText, setPasteText] =
    useState('')

  const [pasteRows, setPasteRows] =
    useState<ImportedRow[]>([])

  const [pasteError, setPasteError] =
    useState('')

  const [pasteImporting, setPasteImporting] =
    useState(false)

  const [importResult, setImportResult] =
    useState<ImportResult | null>(null)

  const [importError, setImportError] =
    useState('')

  const [importing, setImporting] =
    useState(false)

  const [deletingStudent, setDeletingStudent] =
    useState<string | null>(null)

  /* =========================
     COMMUNICATION
     ========================= */

  const [
    selectedCommunicationStudents,
    setSelectedCommunicationStudents
  ] = useState<string[]>([])

  const [communicationMessage, setCommunicationMessage] =
    useState('')

  const [sendingCommunication, setSendingCommunication] =
    useState(false)

  const [communicationResult, setCommunicationResult] =
    useState('')

  useEffect(() => {
    if (user && classId) {
      void loadClass()
    }
  }, [user, classId])

  async function loadClass() {
    if (!user || !classId) return

    setLoading(true)
    setErrorMessage('')

    try {
      const [
        classRes,
        studentsRes,
        evaluationsRes
      ] = await Promise.all([
        supabase
          .from('classes')
          .select('*')
          .eq('id', classId)
          .eq('teacher_id', user.id)
          .single(),

        supabase
          .from('students')
          .select('*')
          .eq('class_id', classId)
          .eq('teacher_id', user.id)
          .eq('is_active', true)
          .order('last_name')
          .order('first_name'),

        supabase
          .from('evaluations')
          .select('*')
          .eq('class_id', classId)
          .eq('teacher_id', user.id)
          .order('eval_date', {
            ascending: false
          })
      ])

      if (classRes.error) throw classRes.error
      if (studentsRes.error) throw studentsRes.error
      if (evaluationsRes.error) {
        throw evaluationsRes.error
      }

      setSchoolClass(classRes.data as SchoolClass)
      setStudents(
        (studentsRes.data as Student[]) ?? []
      )
      setEvaluations(
        (evaluationsRes.data as Evaluation[]) ?? []
      )
    } catch (error) {
      console.error(
        '[ClassDetail] Erreur chargement :',
        error
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Impossible de charger la classe.'
      )
    } finally {
      setLoading(false)
    }
  }

  /* =========================
     AJOUT MANUEL
     ========================= */

  async function handleAddStudent() {
    if (!user || !classId) return

    const lastName =
      studentForm.last_name.trim()

    const firstName =
      studentForm.first_name.trim()

    if (!lastName) {
      setErrorMessage(
        'Le nom de famille est obligatoire.'
      )
      return
    }

    if (!firstName) {
      setErrorMessage(
        'Le prénom est obligatoire.'
      )
      return
    }

    setErrorMessage('')

    try {
      const { error } =
        await supabase
          .from('students')
          .insert({
            teacher_id: user.id,
            class_id: classId,
            last_name: lastName,
            first_name: firstName,
            gender:
              studentForm.gender || null,
            parent_whatsapp:
              studentForm.parent_whatsapp.trim() ||
              null,
            is_active: true
          })

      if (error) throw error

      setStudentForm({
        last_name: '',
        first_name: '',
        gender: '',
        parent_whatsapp: ''
      })

      setShowStudentForm(false)

      await loadClass()
    } catch (error) {
      console.error(
        '[ClassDetail] Erreur ajout élève :',
        error
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible d'ajouter l'élève."
      )
    }
  }

  /* =========================
     COLLAGE D'UNE LISTE
     ========================= */

  function parsePastedStudents(
    text: string
  ): ImportedRow[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    const rows: ImportedRow[] = []

    for (const line of lines) {
      let columns: string[] = []

      if (line.includes('\t')) {
        columns = line.split('\t')
      } else if (line.includes(';')) {
        columns = line.split(';')
      } else if (line.includes(',')) {
        columns = line.split(',')
      } else {
        columns = line.split(/\s+/)
      }

      columns = columns
        .map((value) => value.trim())
        .filter(Boolean)

      if (columns.length < 2) {
        continue
      }

      const first = columns[0]
      const second = columns[1]
      const third = columns[2] ?? ''

      const possibleGender =
        third.trim().toUpperCase()

      const gender =
        possibleGender === 'F' ||
        possibleGender === 'M'
          ? possibleGender
          : ''

      rows.push({
        Nom: first,
        Prenom: second,
        Sexe: gender
      })
    }

    return rows
  }

  function previewPastedStudents() {
    setPasteError('')

    const rows =
      parsePastedStudents(pasteText)

    if (rows.length === 0) {
      setPasteRows([])

      setPasteError(
        'Aucun élève détecté. Collez au minimum le Nom et le Prénom de chaque élève.'
      )

      return
    }

    setPasteRows(rows)
  }

  async function confirmPastedImport() {
    if (
      !user ||
      !classId ||
      pasteRows.length === 0
    ) {
      return
    }

    const validRows =
      pasteRows.filter(
        (row) =>
          row.Nom?.trim() &&
          row.Prenom?.trim()
      )

    if (validRows.length === 0) {
      setPasteError(
        'Aucune ligne complète à importer.'
      )
      return
    }

    setPasteImporting(true)
    setPasteError('')

    try {
      await insertImportedStudents(
        validRows,
        user.id,
        classId
      )

      setPasteText('')
      setPasteRows([])
      setShowPasteImport(false)

      await loadClass()
    } catch (error) {
      setPasteError(
        error instanceof Error
          ? error.message
          : "L'import des élèves a échoué."
      )
    } finally {
      setPasteImporting(false)
    }
  }

  function closePasteImport() {
    if (pasteImporting) return

    setShowPasteImport(false)
    setPasteText('')
    setPasteRows([])
    setPasteError('')
  }

  /* =========================
     IMPORT EXCEL / CSV / WORD / PDF
     ========================= */

  async function handleFileSelect(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0]

    event.target.value = ''

    if (!file) return

    setImportError('')
    setImportResult(null)

    try {
      const result =
        await parseStudentsFile(file)

      setImportResult(result)
    } catch (error) {
      console.error(
        '[ClassDetail] Erreur import fichier :',
        error
      )

      setImportError(
        error instanceof Error
          ? error.message
          : 'Impossible de lire ce fichier.'
      )
    }
  }

  async function confirmImport() {
    if (
      !importResult ||
      !classId ||
      !user
    ) {
      return
    }

    const validRows =
      importResult.rows.filter(
        (row) =>
          row.Nom?.trim() &&
          row.Prenom?.trim()
      )

    if (validRows.length === 0) {
      setImportError(
        'Aucune ligne complète à importer : chaque élève doit avoir un Nom et un Prénom.'
      )

      return
    }

    setImporting(true)
    setImportError('')

    try {
      await insertImportedStudents(
        validRows,
        user.id,
        classId
      )

      setImportResult(null)

      await loadClass()
    } catch (error) {
      console.error(
        '[ClassDetail] Erreur enregistrement import :',
        error
      )

      setImportError(
        error instanceof Error
          ? error.message
          : "L'import n'a pas pu être enregistré."
      )
    } finally {
      setImporting(false)
    }
  }

  const incompleteRows =
    importResult
      ? importResult.rows.filter(
          (row) =>
            !row.Nom?.trim() ||
            !row.Prenom?.trim()
        ).length
      : 0

  /* =========================
     SUPPRESSION
     ========================= */

  async function handleDeleteStudent(
    student: Student
  ) {
    if (!user) return

    const confirmed =
      window.confirm(
        `Retirer ${student.last_name} ${student.first_name} de cette classe ?`
      )

    if (!confirmed) return

    setDeletingStudent(student.id)
    setErrorMessage('')

    try {
      const { error } =
        await supabase
          .from('students')
          .update({
            is_active: false
          })
          .eq('id', student.id)
          .eq('teacher_id', user.id)

      if (error) throw error

      setStudents((current) =>
        current.filter(
          (item) =>
            item.id !== student.id
        )
      )
    } catch (error) {
      console.error(
        '[ClassDetail] Erreur suppression élève :',
        error
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de retirer l'élève."
      )
    } finally {
      setDeletingStudent(null)
    }
  }

  /* =========================
     NOTES
     ========================= */

  async function loadAllGrades() {
    if (!user || !classId) return

    setLoadingGradebook(true)
    setErrorMessage('')

    try {
      const evaluationIds =
        evaluations.map(
          (evaluation) => evaluation.id
        )

      if (
        evaluationIds.length === 0
      ) {
        setAllGrades({})
        setLoadingGradebook(false)
        return
      }

      const { data, error } =
        await supabase
          .from('grades')
          .select('*')
          .eq('teacher_id', user.id)
          .in(
            'evaluation_id',
            evaluationIds
          )

      if (error) throw error

      const map: GradeMap = {}

      for (
        const grade of
          (data as Grade[]) ?? []
      ) {
        map[
          `${grade.evaluation_id}:${grade.student_id}`
        ] = grade
      }

      setAllGrades(map)
    } catch (error) {
      console.error(
        '[ClassDetail] Erreur carnet :',
        error
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Impossible de charger le carnet de notes.'
      )
    } finally {
      setLoadingGradebook(false)
    }
  }

  useEffect(() => {
    if (
      activeSection === 'resultats' &&
      user &&
      evaluations.length > 0
    ) {
      void loadAllGrades()
    }
  }, [
    activeSection,
    evaluations,
    user
  ])

  function initializeDrafts(
    gradeMap: GradeMap
  ) {
    const scoreMap: Record<
      string,
      string
    > = {}

    const absenceMap: Record<
      string,
      boolean
    > = {}

    for (const student of students) {
      const grade =
        gradeMap[student.id]

      scoreMap[student.id] =
        grade?.score !== null &&
        grade?.score !== undefined
          ? String(grade.score)
          : ''

      absenceMap[student.id] =
        grade?.is_absent ?? false
    }

    setDraftScores(scoreMap)
    setDraftAbsences(absenceMap)
  }

  async function openEvaluation(
    evaluation: Evaluation
  ) {
    if (!user) return

    setSelectedEvaluation(evaluation)
    setActiveSection('evaluations')
    setLoadingGrades(true)
    setErrorMessage('')
    setGradesSavedMessage('')

    const { data, error } =
      await supabase
        .from('grades')
        .select('*')
        .eq(
          'evaluation_id',
          evaluation.id
        )
        .eq(
          'teacher_id',
          user.id
        )

    if (error) {
      setErrorMessage(
        `Impossible de charger les notes : ${error.message}`
      )

      setGrades({})
      initializeDrafts({})
      setLoadingGrades(false)

      return
    }

    const gradeMap: GradeMap = {}

    for (
      const grade of
        (data as Grade[]) ?? []
    ) {
      gradeMap[grade.student_id] =
        grade
    }

    setGrades(gradeMap)
    initializeDrafts(gradeMap)
    setLoadingGrades(false)
  }

  function closeEvaluation() {
    setSelectedEvaluation(null)
    setGrades({})
    setDraftScores({})
    setDraftAbsences({})
    setGradesSavedMessage('')
    setErrorMessage('')
  }

  function updateDraftScore(
    studentId: string,
    value: string
  ) {
    setGradesSavedMessage('')
    setErrorMessage('')

    setDraftScores((current) => ({
      ...current,
      [studentId]: value
    }))
  }

  function toggleAbsence(
    studentId: string
  ) {
    setGradesSavedMessage('')
    setErrorMessage('')

    setDraftAbsences((current) => {
      const nextAbsent =
        !(current[studentId] ?? false)

      if (nextAbsent) {
        setDraftScores((scores) => ({
          ...scores,
          [studentId]: ''
        }))
      }

      return {
        ...current,
        [studentId]: nextAbsent
      }
    })
  }

  function focusNextGradeInput(
    studentIndex: number
  ) {
    const inputs =
      Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[data-grade-input="true"]'
        )
      )

    const next =
      inputs[studentIndex + 1]

    if (next) {
      next.focus()
      next.select()
    }
  }

  async function saveAllGrades() {
    if (
      !user ||
      !selectedEvaluation
    ) {
      return
    }

    setSavingAllGrades(true)
    setErrorMessage('')
    setGradesSavedMessage('')

    try {
      for (const student of students) {
        const value =
          (
            draftScores[student.id] ??
            ''
          ).trim()

        const isAbsent =
          draftAbsences[student.id] ??
          false

        const existing =
          grades[student.id]

        if (isAbsent) {
          if (existing) {
            const { data, error } =
              await supabase
                .from('grades')
                .update({
                  score: null,
                  is_absent: true,
                  source: 'manual'
                })
                .eq(
                  'id',
                  existing.id
                )
                .eq(
                  'teacher_id',
                  user.id
                )
                .select()
                .single()

            if (error) throw error

            setGrades((current) => ({
              ...current,
              [student.id]:
                data as Grade
            }))
          } else {
            const { data, error } =
              await supabase
                .from('grades')
                .insert({
                  teacher_id: user.id,
                  evaluation_id:
                    selectedEvaluation.id,
                  student_id:
                    student.id,
                  score: null,
                  is_absent: true,
                  source: 'manual'
                })
                .select()
                .single()

            if (error) throw error

            setGrades((current) => ({
              ...current,
              [student.id]:
                data as Grade
            }))
          }

          continue
        }

        if (value === '') {
          if (existing) {
            const { error } =
              await supabase
                .from('grades')
                .delete()
                .eq(
                  'id',
                  existing.id
                )
                .eq(
                  'teacher_id',
                  user.id
                )

            if (error) throw error

            setGrades((current) => {
              const updated = {
                ...current
              }

              delete updated[
                student.id
              ]

              return updated
            })
          }

          continue
        }

        const score = Number(value)

        if (
          Number.isNaN(score) ||
          score < 0 ||
          score >
            selectedEvaluation.max_score
        ) {
          throw new Error(
            `Note invalide pour ${student.last_name} ${student.first_name}.`
          )
        }

        if (existing) {
          const { data, error } =
            await supabase
              .from('grades')
              .update({
                score,
                is_absent: false,
                source: 'manual'
              })
              .eq(
                'id',
                existing.id
              )
              .eq(
                'teacher_id',
                user.id
              )
              .select()
              .single()

          if (error) throw error

          setGrades((current) => ({
            ...current,
            [student.id]:
              data as Grade
          }))
        } else {
          const { data, error } =
            await supabase
              .from('grades')
              .insert({
                teacher_id: user.id,
                evaluation_id:
                  selectedEvaluation.id,
                student_id:
                  student.id,
                score,
                is_absent: false,
                source: 'manual'
              })
              .select()
              .single()

          if (error) throw error

          setGrades((current) => ({
            ...current,
            [student.id]:
              data as Grade
          }))
        }
      }

      setGradesSavedMessage(
        `✓ Notes enregistrées : ${students.length} élèves`
      )

      void loadAllGrades()
    } catch (error) {
      console.error(
        '[ClassDetail] Erreur sauvegarde notes :',
        error
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Impossible d’enregistrer les notes.'
      )
    } finally {
      setSavingAllGrades(false)
    }
  }

  /* =========================
     ÉVALUATIONS
     ========================= */

  function resetEvaluationForm() {
    setEvaluationForm({
      title: '',
      type: 'interrogation',
      subject: '',
      eval_date:
        new Date()
          .toISOString()
          .slice(0, 10),
      coefficient: 1,
      max_score: 20
    })
  }

  async function handleCreateEvaluation() {
    if (!user || !classId) return

    if (!evaluationForm.title.trim()) {
      setErrorMessage(
        "Le titre de l'évaluation est obligatoire."
      )
      return
    }

    if (!evaluationForm.subject.trim()) {
      setErrorMessage(
        'La matière est obligatoire.'
      )
      return
    }

    if (
      evaluationForm.coefficient <= 0
    ) {
      setErrorMessage(
        'Le coefficient doit être supérieur à 0.'
      )
      return
    }

    if (
      evaluationForm.max_score <= 0
    ) {
      setErrorMessage(
        'La note maximale doit être supérieure à 0.'
      )
      return
    }

    setSavingEvaluation(true)
    setErrorMessage('')

    try {
      const { data, error } =
        await supabase
          .from('evaluations')
          .insert({
            teacher_id: user.id,
            class_id: classId,
            title:
              evaluationForm.title.trim(),
            type:
              evaluationForm.type,
            subject:
              evaluationForm.subject.trim(),
            eval_date:
              evaluationForm.eval_date,
            coefficient:
              evaluationForm.coefficient,
            max_score:
              evaluationForm.max_score
          })
          .select()
          .single()

      if (error) throw error

      resetEvaluationForm()
      setShowEvaluationForm(false)

      await loadClass()

      if (data) {
        await openEvaluation(
          data as Evaluation
        )
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de créer l'évaluation."
      )
    } finally {
      setSavingEvaluation(false)
    }
  }

  /* =========================
     CALCULS
     ========================= */

  const studentResults =
    useMemo<StudentResult[]>(() => {
      const results: StudentResult[] =
        students.map((student) => {
          let weightedTotal = 0
          let coefficientTotal = 0
          let graded = 0
          let missing = 0
          let absent = 0

          for (
            const evaluation of
              evaluations
          ) {
            const grade =
              allGrades[
                `${evaluation.id}:${student.id}`
              ]

            if (!grade) {
              missing++
              continue
            }

            if (grade.is_absent) {
              absent++
              continue
            }

            if (
              grade.score === null
            ) {
              missing++
              continue
            }

            const normalized =
              (
                grade.score /
                evaluation.max_score
              ) * 20

            weightedTotal +=
              normalized *
              evaluation.coefficient

            coefficientTotal +=
              evaluation.coefficient

            graded++
          }

          const average =
            coefficientTotal > 0
              ? weightedTotal /
                coefficientTotal
              : null

          return {
            student,
            average,
            rank: null,
            graded,
            missing,
            absent
          }
        })

      const ranked =
        [...results]
          .filter(
            (item) =>
              item.average !== null
          )
          .sort(
            (a, b) =>
              (b.average ?? 0) -
              (a.average ?? 0)
          )

      let lastAverage:
        number | null = null

      let lastRank = 0

      ranked.forEach(
        (item, index) => {
          if (
            item.average !==
            lastAverage
          ) {
            lastRank = index + 1
            lastAverage =
              item.average
          }

          item.rank = lastRank
        }
      )

      return results
    }, [
      students,
      evaluations,
      allGrades
    ])

  const rankedStudents =
    useMemo(
      () =>
        [...studentResults].sort(
          (a, b) => {
            if (
              a.average === null &&
              b.average === null
            ) {
              return a.student.last_name.localeCompare(
                b.student.last_name
              )
            }

            if (
              a.average === null
            ) {
              return 1
            }

            if (
              b.average === null
            ) {
              return -1
            }

            return (
              (a.rank ?? 9999) -
              (b.rank ?? 9999)
            )
          }
        ),
      [studentResults]
    )

  const classAverage =
    useMemo(() => {
      const values =
        studentResults
          .map(
            (item) =>
              item.average
          )
          .filter(
            (
              value
            ): value is number =>
              value !== null
          )

      if (!values.length) {
        return null
      }

      return (
        values.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / values.length
      )
    }, [studentResults])

  const gradebookStats =
    useMemo(() => {
      if (!selectedEvaluation) {
        return {
          graded: 0,
          absent: 0,
          missing:
            students.length,
          average:
            null as number | null,
          best:
            null as number | null,
          lowest:
            null as number | null
        }
      }

      const scores: number[] = []
      let absent = 0

      for (
        const student of students
      ) {
        if (
          draftAbsences[
            student.id
          ]
        ) {
          absent++
          continue
        }

        const raw =
          (
            draftScores[
              student.id
            ] ?? ''
          ).trim()

        if (!raw) continue

        const score = Number(raw)

        if (
          !Number.isNaN(score)
        ) {
          scores.push(score)
        }
      }

      return {
        graded: scores.length,
        absent,
        missing: Math.max(
          0,
          students.length -
            scores.length -
            absent
        ),
        average: scores.length
          ? scores.reduce(
              (sum, score) =>
                sum + score,
              0
            ) / scores.length
          : null,
        best: scores.length
          ? Math.max(...scores)
          : null,
        lowest: scores.length
          ? Math.min(...scores)
          : null
      }
    }, [
      draftScores,
      draftAbsences,
      selectedEvaluation,
      students
    ])

  /* =========================
     COMMUNICATION
     ========================= */

  const whatsappStudents =
    students.filter(
      (student) =>
        Boolean(
          student.parent_whatsapp &&
            student.parent_whatsapp.trim()
        )
    )

  const selectedWhatsappStudents =
    whatsappStudents.filter(
      (student) =>
        selectedCommunicationStudents.includes(
          student.id
        )
    )

  function toggleCommunicationStudent(
    studentId: string
  ) {
    setCommunicationResult('')

    setSelectedCommunicationStudents(
      (current) =>
        current.includes(studentId)
          ? current.filter(
              (id) =>
                id !== studentId
            )
          : [
              ...current,
              studentId
            ]
    )
  }

  function selectAllCommunicationStudents() {
    setSelectedCommunicationStudents(
      whatsappStudents.map(
        (student) => student.id
      )
    )
  }

  function clearCommunicationSelection() {
    setSelectedCommunicationStudents([])
  }

  function personalizedMessageForStudent(
    student: Student,
    message: string
  ) {
    return (
      `Bonjour, message concernant ${student.first_name} ${student.last_name} ` +
      `(classe ${schoolClass?.name ?? ''}).\n\n${message}`
    )
  }

  async function openWhatsAppCommunication() {
    const message =
      communicationMessage.trim()

    if (!message) {
      setCommunicationResult(
        'Écrivez d’abord le message à envoyer.'
      )
      return
    }

    if (
      selectedWhatsappStudents.length ===
      0
    ) {
      setCommunicationResult(
        'Sélectionnez au moins un destinataire.'
      )
      return
    }

    setSendingCommunication(true)

    let openedCount = 0

    try {
      for (
        const student of
          selectedWhatsappStudents
      ) {
        const number =
          student.parent_whatsapp
            ?.replace(/\D/g, '')
            .trim()

        if (!number) continue

        window.open(
          `https://wa.me/${number}?text=${encodeURIComponent(
            personalizedMessageForStudent(
              student,
              message
            )
          )}`,
          '_blank'
        )

        openedCount++

        if (user && classId) {
          await supabase
            .from('whatsapp_history')
            .insert({
              teacher_id: user.id,
              student_id: student.id,
              class_id: classId,
              message_type:
                'communication_classe',
              message_content:
                personalizedMessageForStudent(
                  student,
                  message
                ),
              parent_whatsapp:
                student.parent_whatsapp,
              status: 'sent',
              share_method:
                'wa_link_fallback'
            })
        }
      }

      setCommunicationResult(
        `${openedCount} conversation${
          openedCount > 1 ? 's' : ''
        } WhatsApp ouverte${
          openedCount > 1 ? 's' : ''
        }.`
      )
    } finally {
      setSendingCommunication(false)
    }
  }

  function selectSection(
    section: ClassSection
  ) {
    setActiveSection(section)
    setShowEvaluationForm(false)

    if (
      section !== 'evaluations'
    ) {
      setSelectedEvaluation(null)
      setGrades({})
      setDraftScores({})
      setDraftAbsences({})
      setGradesSavedMessage('')
    }

    setErrorMessage('')
  }

  /* =========================
     CHARGEMENT
     ========================= */

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-primary-500">
          Chargement de la classe…
        </p>
      </div>
    )
  }

  if (!schoolClass) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={() =>
            navigate('/classes')
          }
          className="flex items-center gap-2 text-sm text-primary-600"
        >
          <ArrowLeft size={16} />
          Retour aux classes
        </button>

        <p className="mt-6 text-sm text-red-600">
          Classe introuvable.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* EN-TÊTE */}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() =>
              navigate('/classes')
            }
            className="flex items-center gap-1 text-xs text-primary-500 mb-2"
          >
            <ArrowLeft size={14} />
            Retour aux classes
          </button>

          <h1 className="text-xl md:text-2xl font-bold text-primary-800">
            {schoolClass.name}
          </h1>

          <p className="text-sm text-primary-500">
            {schoolClass.level ||
              'Classe'}{' '}
            ·{' '}
            {schoolClass.school_year}
          </p>
        </div>

        <div className="rounded-xl bg-primary-50 px-4 py-3">
          <p className="text-xs text-primary-400">
            Élèves
          </p>

          <p className="text-xl font-bold text-primary-800">
            {students.length}
          </p>
        </div>
      </div>

      {/* ERREUR */}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start justify-between gap-3">
          <span>{errorMessage}</span>

          <button
            type="button"
            onClick={() =>
              setErrorMessage('')
            }
            className="shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* NAVIGATION */}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {[
          ['eleves', <Users size={16} />, 'Élèves'],
          ['evaluations', <ClipboardList size={16} />, 'Évaluations'],
          ['resultats', <BarChart3 size={16} />, 'Résultats'],
          ['bulletins', <FileText size={16} />, 'Bulletins'],
          ['communication', <MessageCircle size={16} />, 'WhatsApp'],
          ['parametres', <Settings size={16} />, 'Paramètres']
        ].map(([section, icon, label]) => (
          <button
            key={section as string}
            type="button"
            onClick={() =>
              selectSection(
                section as ClassSection
              )
            }
            className={`rounded-lg p-3 text-sm flex items-center justify-center gap-2 ${
              activeSection === section
                ? 'bg-primary-600 text-white'
                : 'bg-primary-50 text-primary-700'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* =========================
          ÉLÈVES
          ========================= */}

      {activeSection === 'eleves' && (
        <section className="card">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-primary-800">
                Élèves de {schoolClass.name}
              </h2>

              <p className="text-xs text-primary-400">
                Ajoutez manuellement, collez une liste ou importez un fichier.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setErrorMessage('')
                  setShowStudentForm(
                    (current) => !current
                  )
                }}
                className="btn-primary flex items-center gap-1 text-sm"
              >
                <Plus size={15} />
                Ajouter
              </button>

              <button
                type="button"
                onClick={() => {
                  setPasteError('')
                  setImportError('')
                  setShowPasteImport(true)
                }}
                className="btn-secondary flex items-center gap-1 text-sm"
              >
                <ClipboardPaste size={15} />
                Coller une liste
              </button>

              <label className="btn-secondary flex items-center gap-1 text-sm cursor-pointer">
                <Upload size={15} />
                Importer
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={
                    handleFileSelect
                  }
                />
              </label>

              <PhotoImportButton
                classId={classId!}
                teacherId={user!.id}
                className={
                  schoolClass.name
                }
                onImported={
                  loadClass
                }
              />
            </div>
          </div>

          {/* AJOUT MANUEL */}

          {showStudentForm && (
            <div className="mb-5 rounded-xl border border-primary-100 bg-primary-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-primary-800">
                  Nouvel élève
                </h3>

                <button
                  type="button"
                  onClick={() =>
                    setShowStudentForm(false)
                  }
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <input
                  className="input-field"
                  placeholder="Nom"
                  value={
                    studentForm.last_name
                  }
                  onChange={(e) =>
                    setStudentForm({
                      ...studentForm,
                      last_name:
                        e.target.value
                    })
                  }
                />

                <input
                  className="input-field"
                  placeholder="Prénom"
                  value={
                    studentForm.first_name
                  }
                  onChange={(e) =>
                    setStudentForm({
                      ...studentForm,
                      first_name:
                        e.target.value
                    })
                  }
                />

                <select
                  className="input-field"
                  value={
                    studentForm.gender
                  }
                  onChange={(e) =>
                    setStudentForm({
                      ...studentForm,
                      gender:
                        e.target.value
                    })
                  }
                >
                  <option value="">
                    Sexe
                  </option>
                  <option value="M">
                    Masculin
                  </option>
                  <option value="F">
                    Féminin
                  </option>
                </select>

                <input
                  className="input-field"
                  placeholder="WhatsApp parent"
                  value={
                    studentForm.parent_whatsapp
                  }
                  onChange={(e) =>
                    setStudentForm({
                      ...studentForm,
                      parent_whatsapp:
                        e.target.value
                    })
                  }
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  void handleAddStudent()
                }
                className="btn-primary mt-3 flex items-center gap-2 text-sm"
              >
                <Save size={15} />
                Enregistrer
              </button>
            </div>
          )}

          {/* COLLAGE DE LISTE */}

          {showPasteImport && (
            <div className="mb-5 rounded-xl border border-primary-100 bg-primary-50 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-primary-800">
                    Coller une liste d’élèves
                  </h3>

                  <p className="text-xs text-primary-500 mt-1">
                    Collez directement depuis Excel, Word, WhatsApp ou une conversation.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    closePasteImport
                  }
                  disabled={
                    pasteImporting
                  }
                >
                  <X size={18} />
                </button>
              </div>

              <textarea
                className="input-field min-h-40 font-mono text-sm"
                value={pasteText}
                onChange={(e) =>
                  setPasteText(
                    e.target.value
                  )
                }
                placeholder={
                  'Exemple :\nAHOTON\tGrâce\tF\nADJOVI\tKévin\tM\nAGBOSSOU\tMariam\tF'
                }
              />

              <p className="text-xs text-primary-400 mt-2">
                Format accepté : Nom → Prénom → Sexe.
                Le sexe est facultatif.
              </p>

              {pasteError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {pasteError}
                </div>
              )}

              <button
                type="button"
                onClick={
                  previewPastedStudents
                }
                className="btn-secondary mt-3"
              >
                Vérifier la liste
              </button>

              {pasteRows.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-primary-800">
                      {pasteRows.length} élève(s) détecté(s)
                    </p>
                  </div>

                  <div className="max-h-64 overflow-auto rounded-lg bg-white border border-primary-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-primary-100">
                          <th className="text-left p-2">
                            N°
                          </th>
                          <th className="text-left p-2">
                            Nom
                          </th>
                          <th className="text-left p-2">
                            Prénom
                          </th>
                          <th className="text-left p-2">
                            Sexe
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {pasteRows
                          .slice(0, 50)
                          .map(
                            (
                              row,
                              index
                            ) => (
                              <tr
                                key={`${row.Nom}-${row.Prenom}-${index}`}
                                className="border-b border-primary-50"
                              >
                                <td className="p-2">
                                  {index + 1}
                                </td>

                                <td className="p-2">
                                  {row.Nom ||
                                    '—'}
                                </td>

                                <td className="p-2">
                                  {row.Prenom ||
                                    '—'}
                                </td>

                                <td className="p-2">
                                  {row.Sexe ||
                                    '—'}
                                </td>
                              </tr>
                            )
                          )}
                      </tbody>
                    </table>
                  </div>

                  {pasteRows.length > 50 && (
                    <p className="text-xs text-primary-400 mt-2">
                      Aperçu limité aux 50 premières lignes.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      void confirmPastedImport()
                    }
                    disabled={
                      pasteImporting
                    }
                    className="btn-primary mt-3"
                  >
                    {pasteImporting
                      ? 'Importation…'
                      : `Importer ${pasteRows.length} élèves`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ERREUR IMPORT */}

          {importError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {importError}
            </div>
          )}

          {/* APERÇU FICHIER */}

          {importResult && (
            <div className="mb-5 rounded-xl border border-primary-100 bg-primary-50 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-primary-800">
                    Import prêt
                  </h3>

                  <p className="text-xs text-primary-500">
                    {importResult.rows.length}{' '}
                    ligne(s) détectée(s).
                  </p>

                  {importResult.format && (
                    <p className="text-xs text-primary-500 mt-1">
                      Format :{' '}
                      {importResult.format}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setImportResult(null)
                  }
                >
                  <X size={18} />
                </button>
              </div>

              {importResult.headers &&
                importResult.headers.length >
                  0 && (
                  <p className="text-xs text-primary-500 mb-2">
                    Colonnes reconnues :{' '}
                    {importResult.headers.join(
                      ', '
                    )}
                  </p>
                )}

              {incompleteRows > 0 && (
                <p className="text-xs text-orange-600 mb-2">
                  {incompleteRows} ligne(s) incomplète(s)
                  seront ignorée(s).
                </p>
              )}

              {importResult.warnings &&
                importResult.warnings.length >
                  0 && (
                  <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-700">
                    {importResult.warnings.map(
                      (warning, index) => (
                        <p key={index}>
                          {warning}
                        </p>
                      )
                    )}
                  </div>
                )}

              <div className="max-h-64 overflow-auto rounded-lg bg-white border border-primary-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-primary-100">
                      <th className="text-left p-2">
                        N°
                      </th>
                      <th className="text-left p-2">
                        Nom
                      </th>
                      <th className="text-left p-2">
                        Prénom
                      </th>
                      <th className="text-left p-2">
                        Sexe
                      </th>
                      <th className="text-left p-2">
                        WhatsApp
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {importResult.rows
                      .slice(0, 50)
                      .map(
                        (
                          row,
                          index
                        ) => (
                          <tr
                            key={`${row.Nom}-${row.Prenom}-${index}`}
                            className="border-b border-primary-50"
                          >
                            <td className="p-2">
                              {index + 1}
                            </td>

                            <td className="p-2">
                              {row.Nom ||
                                '—'}
                            </td>

                            <td className="p-2">
                              {row.Prenom ||
                                '—'}
                            </td>

                            <td className="p-2">
                              {row.Sexe ||
                                '—'}
                            </td>

                            <td className="p-2">
                              {row.WhatsApp ||
                                '—'}
                            </td>
                          </tr>
                        )
                      )}
                  </tbody>
                </table>
              </div>

              {importResult.rows.length >
                50 && (
                <p className="text-xs text-primary-400 mt-2">
                  Aperçu limité aux 50 premières lignes.
                </p>
              )}

              <button
                type="button"
                onClick={() =>
                  void confirmImport()
                }
                disabled={importing}
                className="btn-primary mt-3"
              >
                {importing
                  ? 'Importation…'
                  : `Confirmer l'import dans « ${schoolClass.name} »`}
              </button>
            </div>
          )}

          {/* LISTE */}

          {students.length === 0 ? (
            <div className="rounded-lg bg-primary-50 p-5 text-center">
              <Users
                size={30}
                className="mx-auto mb-2 text-primary-400"
              />

              <p className="text-sm text-primary-500">
                Aucun élève dans cette classe.
              </p>

              <p className="text-xs text-primary-400 mt-1">
                Utilisez « Ajouter », « Coller une liste » ou « Importer ».
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-primary-100 text-xs text-primary-400">
                    <th className="text-left py-3 px-2">
                      N°
                    </th>

                    <th className="text-left py-3 px-2">
                      Élève
                    </th>

                    <th className="text-left py-3 px-2">
                      Sexe
                    </th>

                    <th className="text-left py-3 px-2">
                      WhatsApp
                    </th>

                    <th className="text-right py-3 px-2">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {students.map(
                    (
                      student,
                      index
                    ) => (
                      <tr
                        key={
                          student.id
                        }
                        className="border-b border-primary-50"
                      >
                        <td className="py-3 px-2 text-primary-400">
                          {index + 1}
                        </td>

                        <td className="py-3 px-2 font-medium text-primary-800">
                          {
                            student.last_name
                          }{' '}
                          {
                            student.first_name
                          }
                        </td>

                        <td className="py-3 px-2">
                          {student.gender ||
                            '—'}
                        </td>

                        <td className="py-3 px-2">
                          {student.parent_whatsapp ||
                            '—'}
                        </td>

                        <td className="py-3 px-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              void handleDeleteStudent(
                                student
                              )
                            }
                            disabled={
                              deletingStudent ===
                              student.id
                            }
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
                          >
                            <Trash2
                              size={14}
                            />

                            {deletingStudent ===
                            student.id
                              ? '…'
                              : 'Retirer'}
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* =========================
          ÉVALUATIONS
          ========================= */}

      {activeSection ===
        'evaluations' && (
        <>
          {!selectedEvaluation && (
            <section className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold text-primary-800">
                    Évaluations de{' '}
                    {schoolClass.name}
                  </h2>

                  <p className="text-xs text-primary-400">
                    Cliquez sur une évaluation pour saisir les notes.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    resetEvaluationForm()
                    setShowEvaluationForm(
                      true
                    )
                  }}
                  className="btn-primary flex items-center gap-1 text-sm"
                >
                  <Plus size={15} />
                  Ajouter
                </button>
              </div>

              {showEvaluationForm && (
                <div className="mb-5 rounded-xl bg-primary-50 p-4">
                  <h3 className="font-semibold text-primary-800 mb-3">
                    Nouvelle évaluation
                  </h3>

                  <div className="grid md:grid-cols-2 gap-3">
                    <input
                      className="input-field"
                      placeholder="Titre"
                      value={
                        evaluationForm.title
                      }
                      onChange={(e) =>
                        setEvaluationForm({
                          ...evaluationForm,
                          title:
                            e.target.value
                        })
                      }
                    />

                    <input
                      className="input-field"
                      placeholder="Matière"
                      value={
                        evaluationForm.subject
                      }
                      onChange={(e) =>
                        setEvaluationForm({
                          ...evaluationForm,
                          subject:
                            e.target.value
                        })
                      }
                    />

                    <select
                      className="input-field"
                      value={
                        evaluationForm.type
                      }
                      onChange={(e) =>
                        setEvaluationForm({
                          ...evaluationForm,
                          type:
                            e.target
                              .value as EvaluationType
                        })
                      }
                    >
                      <option value="interrogation">
                        Interrogation
                      </option>

                      <option value="devoir">
                        Devoir
                      </option>

                      <option value="composition">
                        Composition
                      </option>

                      <option value="examen">
                        Examen
                      </option>
                    </select>

                    <input
                      type="date"
                      className="input-field"
                      value={
                        evaluationForm.eval_date
                      }
                      onChange={(e) =>
                        setEvaluationForm({
                          ...evaluationForm,
                          eval_date:
                            e.target.value
                        })
                      }
                    />

                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      className="input-field"
                      placeholder="Coefficient"
                      value={
                        evaluationForm.coefficient
                      }
                      onChange={(e) =>
                        setEvaluationForm({
                          ...evaluationForm,
                          coefficient:
                            Number(
                              e.target.value
                            )
                        })
                      }
                    />

                    <input
                      type="number"
                      min="1"
                      className="input-field"
                      placeholder="Note maximale"
                      value={
                        evaluationForm.max_score
                      }
                      onChange={(e) =>
                        setEvaluationForm({
                          ...evaluationForm,
                          max_score:
                            Number(
                              e.target.value
                            )
                        })
                      }
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void handleCreateEvaluation()
                    }
                    disabled={
                      savingEvaluation
                    }
                    className="btn-primary mt-3"
                  >
                    {savingEvaluation
                      ? 'Création…'
                      : 'Créer l’évaluation'}
                  </button>
                </div>
              )}

              {evaluations.length ===
              0 ? (
                <p className="text-sm text-primary-400">
                  Aucune évaluation.
                </p>
              ) : (
                <div className="divide-y divide-primary-100">
                  {evaluations.map(
                    (
                      evaluation
                    ) => (
                      <button
                        key={
                          evaluation.id
                        }
                        type="button"
                        onClick={() =>
                          void openEvaluation(
                            evaluation
                          )
                        }
                        className="w-full py-3 flex items-center justify-between text-left hover:bg-primary-50 rounded-lg px-2"
                      >
                        <div>
                          <p className="font-medium text-primary-800 text-sm">
                            {
                              evaluation.title
                            }
                          </p>

                          <p className="text-xs text-primary-400">
                            {
                              evaluation.subject
                            }{' '}
                            · /
                            {
                              evaluation.max_score
                            }{' '}
                            · Coeff.{' '}
                            {
                              evaluation.coefficient
                            }
                          </p>
                        </div>

                        <span className="text-xs text-primary-600">
                          Ouvrir
                        </span>
                      </button>
                    )
                  )}
                </div>
              )}
            </section>
          )}

          {selectedEvaluation && (
            <section className="card">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <button
                    type="button"
                    onClick={
                      closeEvaluation
                    }
                    className="flex items-center gap-1 text-xs text-primary-600 mb-2"
                  >
                    <ArrowLeft size={14} />
                    Retour
                  </button>

                  <h2 className="font-semibold text-primary-800">
                    {
                      selectedEvaluation.title
                    }
                  </h2>

                  <p className="text-xs text-primary-400">
                    {
                      selectedEvaluation.subject
                    }{' '}
                    · /
                    {
                      selectedEvaluation.max_score
                    }{' '}
                    · Coeff.{' '}
                    {
                      selectedEvaluation.coefficient
                    }
                  </p>
                </div>
              </div>

              {loadingGrades ? (
                <p className="text-sm text-primary-400">
                  Chargement des notes…
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                    <div className="rounded-lg bg-primary-50 p-2">
                      <p className="text-xs text-primary-400">
                        Notés
                      </p>

                      <p className="font-semibold text-primary-800">
                        {
                          gradebookStats.graded
                        }
                        /
                        {
                          students.length
                        }
                      </p>
                    </div>

                    <div className="rounded-lg bg-primary-50 p-2">
                      <p className="text-xs text-primary-400">
                        Absents
                      </p>

                      <p className="font-semibold text-primary-800">
                        {
                          gradebookStats.absent
                        }
                      </p>
                    </div>

                    <div className="rounded-lg bg-primary-50 p-2">
                      <p className="text-xs text-primary-400">
                        À saisir
                      </p>

                      <p className="font-semibold text-primary-800">
                        {
                          gradebookStats.missing
                        }
                      </p>
                    </div>

                    <div className="rounded-lg bg-primary-50 p-2">
                      <p className="text-xs text-primary-400">
                        Moyenne
                      </p>

                      <p className="font-semibold text-primary-800">
                        {gradebookStats.average ===
                        null
                          ? '—'
                          : gradebookStats.average.toFixed(
                              2
                            )}
                      </p>
                    </div>

                    <div className="rounded-lg bg-primary-50 p-2">
                      <p className="text-xs text-primary-400">
                        Meilleure
                      </p>

                      <p className="font-semibold text-primary-800">
                        {gradebookStats.best ===
                        null
                          ? '—'
                          : `${gradebookStats.best}/${selectedEvaluation.max_score}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end mb-3">
                    <button
                      type="button"
                      onClick={() =>
                        void saveAllGrades()
                      }
                      disabled={
                        savingAllGrades
                      }
                      className="btn-primary flex items-center gap-2 text-sm"
                    >
                      <Save size={16} />

                      {savingAllGrades
                        ? 'Enregistrement…'
                        : 'Enregistrer tout'}
                    </button>
                  </div>

                  {gradesSavedMessage && (
                    <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                      {gradesSavedMessage}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-sm">
                      <thead>
                        <tr className="border-b border-primary-100 text-xs text-primary-400 text-left">
                          <th className="py-2 px-2">
                            N°
                          </th>

                          <th className="py-2 px-2">
                            Élève
                          </th>

                          <th className="py-2 px-2 text-center">
                            Note
                          </th>

                          <th className="py-2 px-2 text-center">
                            Absence
                          </th>

                          <th className="py-2 px-2 text-center">
                            État
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {students.map(
                          (
                            student,
                            index
                          ) => {
                            const absent =
                              draftAbsences[
                                student.id
                              ] ??
                              false

                            const value =
                              draftScores[
                                student.id
                              ] ?? ''

                            return (
                              <tr
                                key={
                                  student.id
                                }
                                className="border-b border-primary-50"
                              >
                                <td className="py-2 px-2 text-xs text-primary-400">
                                  {index + 1}
                                </td>

                                <td className="py-2 px-2 font-medium text-primary-800">
                                  {
                                    student.last_name
                                  }{' '}
                                  {
                                    student.first_name
                                  }
                                </td>

                                <td className="py-2 px-2">
                                  <input
                                    data-grade-input="true"
                                    type="number"
                                    min={0}
                                    max={
                                      selectedEvaluation.max_score
                                    }
                                    step={0.25}
                                    value={
                                      absent
                                        ? ''
                                        : value
                                    }
                                    disabled={
                                      absent ||
                                      savingAllGrades
                                    }
                                    onChange={(
                                      e
                                    ) =>
                                      updateDraftScore(
                                        student.id,
                                        e.target.value
                                      )
                                    }
                                    onKeyDown={(
                                      e
                                    ) => {
                                      if (
                                        e.key ===
                                        'Enter'
                                      ) {
                                        e.preventDefault()

                                        focusNextGradeInput(
                                          index
                                        )
                                      }
                                    }}
                                    className="input-field w-24 mx-auto text-center"
                                    placeholder="—"
                                  />
                                </td>

                                <td className="py-2 px-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleAbsence(
                                        student.id
                                      )
                                    }
                                    disabled={
                                      savingAllGrades
                                    }
                                    className={`px-3 py-1.5 rounded-lg text-xs ${
                                      absent
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-primary-50 text-primary-600'
                                    }`}
                                  >
                                    {absent
                                      ? 'ABS'
                                      : 'Présent'}
                                  </button>
                                </td>

                                <td className="py-2 px-2 text-center text-xs">
                                  {absent
                                    ? 'Absent'
                                    : value.trim()
                                      ? 'Saisi'
                                      : 'À saisir'}
                                </td>
                              </tr>
                            )
                          }
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}

      {/* =========================
          RÉSULTATS
          ========================= */}

      {activeSection ===
        'resultats' && (
        <section className="card">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3
                  size={20}
                  className="text-primary-500"
                />

                <h2 className="font-semibold text-primary-800">
                  Carnet de notes intelligent
                </h2>
              </div>

              <p className="text-sm text-primary-500 mt-1">
                {students.length} élèves ·{' '}
                {evaluations.length} évaluations
              </p>
            </div>

            <div className="rounded-lg bg-primary-50 px-4 py-2">
              <p className="text-xs text-primary-400">
                Moyenne de la classe
              </p>

              <p className="text-xl font-semibold text-primary-800">
                {classAverage ===
                null
                  ? '—'
                  : `${classAverage.toFixed(2)}/20`}
              </p>
            </div>
          </div>

          {evaluations.length ===
          0 ? (
            <div className="rounded-lg bg-primary-50 p-4">
              <p className="text-sm text-primary-600">
                Créez d'abord des évaluations pour construire le carnet de notes.
              </p>
            </div>
          ) : loadingGradebook ? (
            <p className="text-sm text-primary-400 py-5">
              Construction du carnet de notes…
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-primary-100 text-xs text-primary-400">
                    <th className="py-3 px-2 text-left">
                      Rang
                    </th>

                    <th className="py-3 px-2 text-left">
                      Élève
                    </th>

                    {evaluations.map(
                      (evaluation) => (
                        <th
                          key={
                            evaluation.id
                          }
                          className="py-3 px-2 text-center"
                        >
                          <div>
                            {
                              evaluation.title
                            }
                          </div>

                          <div className="font-normal">
                            {
                              evaluation.subject
                            }
                            {' · '}
                            C
                            {
                              evaluation.coefficient
                            }
                          </div>
                        </th>
                      )
                    )}

                    <th className="py-3 px-2 text-center">
                      Moyenne
                    </th>

                    <th className="py-3 px-2 text-center">
                      Notes
                    </th>

                    <th className="py-3 px-2 text-center">
                      À saisir
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rankedStudents.map(
                    (result) => (
                      <tr
                        key={
                          result.student.id
                        }
                        className="border-b border-primary-50"
                      >
                        <td className="py-3 px-2 text-center font-semibold text-primary-700">
                          {result.rank ??
                            '—'}
                        </td>

                        <td className="py-3 px-2 font-medium text-primary-800">
                          {
                            result.student.last_name
                          }{' '}
                          {
                            result.student.first_name
                          }
                        </td>

                        {evaluations.map(
                          (
                            evaluation
                          ) => {
                            const grade =
                              allGrades[
                                `${evaluation.id}:${result.student.id}`
                              ]

                            return (
                              <td
                                key={
                                  evaluation.id
                                }
                                className="py-3 px-2 text-center"
                              >
                                {!grade ? (
                                  '—'
                                ) : grade.is_absent ? (
                                  <span className="text-red-600">
                                    ABS
                                  </span>
                                ) : grade.score ===
                                  null ? (
                                  '—'
                                ) : (
                                  `${grade.score}/${evaluation.max_score}`
                                )}
                              </td>
                            )
                          }
                        )}

                        <td className="py-3 px-2 text-center font-bold">
                          {result.average ===
                          null
                            ? '—'
                            : `${result.average.toFixed(2)}/20`}
                        </td>

                        <td className="py-3 px-2 text-center text-xs">
                          {result.graded}/
                          {
                            evaluations.length
                          }
                        </td>

                        <td className="py-3 px-2 text-center">
                          {result.missing >
                          0 ? (
                            <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-1 text-xs">
                              {
                                result.missing
                              }
                            </span>
                          ) : (
                            <span className="text-green-600 text-xs">
                              Complet
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* =========================
          BULLETINS
          ========================= */}

      {activeSection ===
        'bulletins' && (
        <section className="card">
          <div className="flex items-center gap-2 mb-3">
            <FileText
              size={20}
              className="text-primary-500"
            />

            <h2 className="font-semibold text-primary-800">
              Bulletins
            </h2>
          </div>

          <p className="text-sm text-primary-500 mb-4">
            Les bulletins individuels peuvent être générés et envoyés aux parents depuis cette classe.
          </p>

          <ClassWhatsAppSendButton
            classId={schoolClass.id}
            className={schoolClass.name}
            profile={profile}
          />
        </section>
      )}

      {/* =========================
          COMMUNICATION
          ========================= */}

      {activeSection ===
        'communication' && (
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle
              size={20}
              className="text-primary-500"
            />

            <div>
              <h2 className="font-semibold text-primary-800">
                Communication WhatsApp
              </h2>

              <p className="text-xs text-primary-400">
                {whatsappStudents.length} parent(s) avec un numéro WhatsApp.
              </p>
            </div>
          </div>

          {whatsappStudents.length ===
          0 ? (
            <p className="text-sm text-primary-400">
              Aucun numéro WhatsApp parent n'est renseigné.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={
                    selectAllCommunicationStudents
                  }
                  className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-700"
                >
                  Tout sélectionner
                </button>

                <button
                  type="button"
                  onClick={
                    clearCommunicationSelection
                  }
                  className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-700"
                >
                  Tout désélectionner
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-auto mb-4">
                {whatsappStudents.map(
                  (student) => {
                    const checked =
                      selectedCommunicationStudents.includes(
                        student.id
                      )

                    return (
                      <label
                        key={
                          student.id
                        }
                        className="flex items-center gap-3 rounded-lg border border-primary-100 p-3 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            toggleCommunicationStudent(
                              student.id
                            )
                          }
                        />

                        <span className="text-sm text-primary-800">
                          {
                            student.last_name
                          }{' '}
                          {
                            student.first_name
                          }
                        </span>

                        <span className="ml-auto text-xs text-primary-400">
                          {
                            student.parent_whatsapp
                          }
                        </span>
                      </label>
                    )
                  }
                )}
              </div>

              <textarea
                className="input-field min-h-32"
                placeholder="Écrivez votre message aux parents…"
                value={
                  communicationMessage
                }
                onChange={(e) =>
                  setCommunicationMessage(
                    e.target.value
                  )
                }
              />

              <button
                type="button"
                onClick={() =>
                  void openWhatsAppCommunication()
                }
                disabled={
                  sendingCommunication
                }
                className="btn-primary mt-3 flex items-center gap-2"
              >
                <MessageCircle size={16} />

                {sendingCommunication
                  ? 'Ouverture…'
                  : `Ouvrir WhatsApp (${selectedWhatsappStudents.length})`}
              </button>

              {communicationResult && (
                <p className="mt-3 text-sm text-primary-600">
                  {
                    communicationResult
                  }
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* =========================
          PARAMÈTRES
          ========================= */}

      {activeSection ===
        'parametres' && (
        <section className="card">
          <div className="flex items-center gap-2 mb-4">
            <Settings
              size={20}
              className="text-primary-500"
            />

            <h2 className="font-semibold text-primary-800">
              Paramètres de la classe
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg bg-primary-50 p-4">
              <p className="text-xs text-primary-400">
                Nom
              </p>

              <p className="font-semibold text-primary-800">
                {schoolClass.name}
              </p>
            </div>

            <div className="rounded-lg bg-primary-50 p-4">
              <p className="text-xs text-primary-400">
                Niveau
              </p>

              <p className="font-semibold text-primary-800">
                {schoolClass.level ||
                  'Non renseigné'}
              </p>
            </div>

            <div className="rounded-lg bg-primary-50 p-4">
              <p className="text-xs text-primary-400">
                Année scolaire
              </p>

              <p className="font-semibold text-primary-800">
                {
                  schoolClass.school_year
                }
              </p>
            </div>

            <div className="rounded-lg bg-primary-50 p-4">
              <p className="text-xs text-primary-400">
                Élèves actifs
              </p>

              <p className="font-semibold text-primary-800">
                {students.length}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-primary-100 p-4">
            <p className="text-sm text-primary-600">
              La gestion détaillée des paramètres de classe reste accessible depuis le module Classes.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}