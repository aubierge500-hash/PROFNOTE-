import { useEffect, useMemo, useState } from 'react'
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
  CheckSquare
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import ClassWhatsAppSendButton from '@/components/ClassWhatsAppSendButton'

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

export default function ClassDetail() {
  const { classId } = useParams<{ classId: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [selectedEvaluation, setSelectedEvaluation] =
    useState<Evaluation | null>(null)

  const [grades, setGrades] =
    useState<Record<string, Grade>>({})

  const [draftScores, setDraftScores] =
    useState<Record<string, string>>({})

  const [draftAbsences, setDraftAbsences] =
    useState<Record<string, boolean>>({})

  const [activeSection, setActiveSection] =
    useState<ClassSection>('eleves')

  const [loading, setLoading] = useState(true)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [savingAllGrades, setSavingAllGrades] = useState(false)

  const [errorMessage, setErrorMessage] = useState('')
  const [gradesSavedMessage, setGradesSavedMessage] = useState('')

  const [showEvaluationForm, setShowEvaluationForm] =
    useState(false)

  const [savingEvaluation, setSavingEvaluation] =
    useState(false)

  const [form, setForm] = useState({
    title: '',
    type: 'interrogation' as EvaluationType,
    subject: '',
    eval_date: new Date().toISOString().slice(0, 10),
    coefficient: 1,
    max_score: 20
  })

  const [selectedCommunicationStudents, setSelectedCommunicationStudents] =
    useState<string[]>([])

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
      const [classRes, studentsRes, evaluationsRes] =
        await Promise.all([
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
            .order('eval_date', { ascending: false })
        ])

      if (classRes.error) throw classRes.error
      if (studentsRes.error) throw studentsRes.error
      if (evaluationsRes.error) throw evaluationsRes.error

      setSchoolClass(classRes.data as SchoolClass)
      setStudents((studentsRes.data as Student[]) ?? [])
      setEvaluations((evaluationsRes.data as Evaluation[]) ?? [])
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

  function initializeDrafts(
    gradeMap: Record<string, Grade>
  ) {
    const scoreMap: Record<string, string> = {}
    const absenceMap: Record<string, boolean> = {}

    for (const student of students) {
      const grade = gradeMap[student.id]

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

    const { data, error } = await supabase
      .from('grades')
      .select('*')
      .eq('evaluation_id', evaluation.id)
      .eq('teacher_id', user.id)

    if (error) {
      console.error(
        '[ClassDetail] Erreur chargement notes :',
        error
      )

      setErrorMessage(
        `Impossible de charger les notes : ${error.message}`
      )

      setGrades({})
      initializeDrafts({})
      setLoadingGrades(false)

      return
    }

    const gradeMap: Record<string, Grade> = {}

    for (const grade of (data as Grade[]) ?? []) {
      gradeMap[grade.student_id] = grade
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

  function toggleAbsence(studentId: string) {
    setGradesSavedMessage('')
    setErrorMessage('')

    setDraftAbsences((current) => {
      const nextAbsent = !(current[studentId] ?? false)

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
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[data-grade-input="true"]'
      )
    )

    const current = inputs[studentIndex]
    const next = inputs[studentIndex + 1]

    if (current && next) {
      next.focus()
      next.select()
    }
  }

  async function saveAllGrades() {
    if (!user || !selectedEvaluation) return

    setSavingAllGrades(true)
    setErrorMessage('')
    setGradesSavedMessage('')

    try {
      for (const student of students) {
        const value = (
          draftScores[student.id] ?? ''
        ).trim()

        const isAbsent =
          draftAbsences[student.id] ?? false

        const existing = grades[student.id]

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
                .eq('id', existing.id)
                .eq('teacher_id', user.id)
                .select()
                .single()

            if (error) throw error

            setGrades((current) => ({
              ...current,
              [student.id]: data as Grade
            }))
          } else {
            const { data, error } =
              await supabase
                .from('grades')
                .insert({
                  teacher_id: user.id,
                  evaluation_id:
                    selectedEvaluation.id,
                  student_id: student.id,
                  score: null,
                  is_absent: true,
                  source: 'manual'
                })
                .select()
                .single()

            if (error) throw error

            setGrades((current) => ({
              ...current,
              [student.id]: data as Grade
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
                .eq('id', existing.id)
                .eq('teacher_id', user.id)

            if (error) throw error

            setGrades((current) => {
              const updated = { ...current }

              delete updated[student.id]

              return updated
            })
          }

          continue
        }

        const score = Number(value)

        if (
          Number.isNaN(score) ||
          score < 0 ||
          score > selectedEvaluation.max_score
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
              .eq('id', existing.id)
              .eq('teacher_id', user.id)
              .select()
              .single()

          if (error) throw error

          setGrades((current) => ({
            ...current,
            [student.id]: data as Grade
          }))
        } else {
          const { data, error } =
            await supabase
              .from('grades')
              .insert({
                teacher_id: user.id,
                evaluation_id:
                  selectedEvaluation.id,
                student_id: student.id,
                score,
                is_absent: false,
                source: 'manual'
              })
              .select()
              .single()

          if (error) throw error

          setGrades((current) => ({
            ...current,
            [student.id]: data as Grade
          }))
        }
      }

      setGradesSavedMessage(
        `✓ Notes enregistrées : ${students.length} élèves`
      )
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

  function resetEvaluationForm() {
    setForm({
      title: '',
      type: 'interrogation',
      subject: '',
      eval_date: new Date()
        .toISOString()
        .slice(0, 10),
      coefficient: 1,
      max_score: 20
    })
  }

  async function handleCreateEvaluation() {
    if (!user || !classId) return

    if (!form.title.trim()) {
      setErrorMessage(
        "Le titre de l'évaluation est obligatoire."
      )
      return
    }

    if (!form.subject.trim()) {
      setErrorMessage(
        'La matière est obligatoire.'
      )
      return
    }

    if (form.coefficient <= 0) {
      setErrorMessage(
        'Le coefficient doit être supérieur à 0.'
      )
      return
    }

    if (form.max_score <= 0) {
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
            title: form.title.trim(),
            type: form.type,
            subject: form.subject.trim(),
            eval_date: form.eval_date,
            coefficient: form.coefficient,
            max_score: form.max_score
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
      console.error(
        '[ClassDetail] Erreur création évaluation :',
        error
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de créer l'évaluation."
      )
    } finally {
      setSavingEvaluation(false)
    }
  }

  function selectSection(
    section: ClassSection
  ) {
    setActiveSection(section)
    setShowEvaluationForm(false)

    if (section !== 'evaluations') {
      setSelectedEvaluation(null)
      setGrades({})
      setDraftScores({})
      setDraftAbsences({})
      setGradesSavedMessage('')
    }

    setErrorMessage('')
  }

  const whatsappStudents =
    students.filter(
      (student) =>
        Boolean(
          student.parent_whatsapp &&
            student.parent_whatsapp.trim() !== ''
        )
    )

  const selectedWhatsappStudents =
    whatsappStudents.filter((student) =>
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
              (id) => id !== studentId
            )
          : [...current, studentId]
    )
  }

  function selectAllCommunicationStudents() {
    setCommunicationResult('')

    setSelectedCommunicationStudents(
      whatsappStudents.map(
        (student) => student.id
      )
    )
  }

  function clearCommunicationSelection() {
    setCommunicationResult('')
    setSelectedCommunicationStudents([])
  }

  function openWhatsAppCommunication() {
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
    setCommunicationResult('')

    let openedCount = 0

    for (const student of selectedWhatsappStudents) {
      const number =
        student.parent_whatsapp
          ?.replace(/\D/g, '')
          .trim()

      if (!number) continue

      const personalizedMessage =
        `Bonjour, message concernant ${student.first_name} ${student.last_name} ` +
        `(classe ${schoolClass?.name ?? ''}).\n\n${message}`

      const whatsappUrl =
        `https://wa.me/${number}?text=` +
        encodeURIComponent(
          personalizedMessage
        )

      window.open(
        whatsappUrl,
        '_blank'
      )

      openedCount++
    }

    setSendingCommunication(false)

    setCommunicationResult(
      `${openedCount} conversation${
        openedCount > 1 ? 's' : ''
      } WhatsApp ouverte${
        openedCount > 1 ? 's' : ''
      }.`
    )

    if (user && classId) {
      void Promise.all(
        selectedWhatsappStudents.map(
          (student) => {
            const number =
              student.parent_whatsapp
                ?.trim() ?? ''

            const personalizedMessage =
              `Bonjour, message concernant ${student.first_name} ${student.last_name} ` +
              `(classe ${schoolClass?.name ?? ''}).\n\n${message}`

            return supabase
              .from('whatsapp_history')
              .insert({
                teacher_id: user.id,
                student_id: student.id,
                class_id: classId,
                message_type:
                  'communication_classe',
                message_content:
                  personalizedMessage,
                parent_whatsapp: number,
                status: 'sent',
                share_method:
                  'wa_link_fallback'
              })
          }
        )
      )
    }
  }

  const gradebookStats = useMemo(() => {
    if (!selectedEvaluation) {
      return {
        graded: 0,
        absent: 0,
        missing: students.length,
        average: null as number | null,
        best: null as number | null,
        lowest: null as number | null
      }
    }

    const scores: number[] = []
    let absent = 0

    for (const student of students) {
      if (draftAbsences[student.id]) {
        absent++
        continue
      }

      const raw = (
        draftScores[student.id] ?? ''
      ).trim()

      if (raw === '') continue

      const score = Number(raw)

      if (!Number.isNaN(score)) {
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

  if (loading) {
    return (
      <div className="space-y-4">
        <button
          onClick={() =>
            navigate('/classes')
          }
          className="flex items-center gap-1 text-sm text-primary-600"
        >
          <ArrowLeft size={16} />
          Retour aux classes
        </button>

        <p className="text-sm text-primary-400">
          Chargement de la classe…
        </p>
      </div>
    )
  }

  if (!schoolClass) {
    return (
      <div className="space-y-4">
        <button
          onClick={() =>
            navigate('/classes')
          }
          className="flex items-center gap-1 text-sm text-primary-600"
        >
          <ArrowLeft size={16} />
          Retour aux classes
        </button>

        <div className="card border border-red-200 bg-red-50 text-sm text-red-700">
          {errorMessage ||
            'Classe introuvable.'}
        </div>
      </div>
    )
  }

  const whatsappCount =
    whatsappStudents.length

  const missingWhatsappCount =
    students.length - whatsappCount

  return (
    <div className="space-y-5">
      <div>
        <button
          onClick={() =>
            navigate('/classes')
          }
          className="flex items-center gap-1 text-sm text-primary-600 mb-3"
        >
          <ArrowLeft size={16} />
          Retour aux classes
        </button>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-primary-800">
              {schoolClass.name}
            </h1>

            <p className="text-sm text-primary-400">
              {schoolClass.level ??
                'Niveau non précisé'}{' '}
              · {schoolClass.school_year}
            </p>
          </div>

          <button
            onClick={() => {
              resetEvaluationForm()
              setShowEvaluationForm(true)
              setActiveSection(
                'evaluations'
              )
              setSelectedEvaluation(null)
              setErrorMessage('')
            }}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus size={16} />
            Évaluation
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() =>
            selectSection('eleves')
          }
          className="card text-left hover:bg-primary-50 transition"
        >
          <div className="flex items-center gap-2">
            <Users
              size={18}
              className="text-primary-500"
            />
            <span className="text-sm text-primary-500">
              Élèves
            </span>
          </div>

          <p className="text-2xl font-semibold text-primary-800 mt-2">
            {students.length}
          </p>
        </button>

        <button
          type="button"
          onClick={() =>
            selectSection(
              'evaluations'
            )
          }
          className="card text-left hover:bg-primary-50 transition"
        >
          <div className="flex items-center gap-2">
            <ClipboardList
              size={18}
              className="text-primary-500"
            />
            <span className="text-sm text-primary-500">
              Évaluations
            </span>
          </div>

          <p className="text-2xl font-semibold text-primary-800 mt-2">
            {evaluations.length}
          </p>
        </button>

        <button
          type="button"
          onClick={() =>
            selectSection('resultats')
          }
          className="card text-left hover:bg-primary-50 transition"
        >
          <div className="flex items-center gap-2">
            <BarChart3
              size={18}
              className="text-primary-500"
            />
            <span className="text-sm text-primary-500">
              Résultats
            </span>
          </div>

          <p className="text-sm text-primary-400 mt-3">
            Moyennes et classement
          </p>
        </button>

        <button
          type="button"
          onClick={() =>
            selectSection('bulletins')
          }
          className="card text-left hover:bg-primary-50 transition"
        >
          <div className="flex items-center gap-2">
            <FileText
              size={18}
              className="text-primary-500"
            />
            <span className="text-sm text-primary-500">
              Bulletins
            </span>
          </div>

          <p className="text-sm text-primary-400 mt-3">
            Bulletins de la classe
          </p>
        </button>
      </div>

      <div className="card p-2">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-1">
          {[
            ['eleves', Users, 'Élèves'],
            [
              'evaluations',
              ClipboardList,
              'Évaluations'
            ],
            [
              'resultats',
              BarChart3,
              'Résultats'
            ],
            [
              'bulletins',
              FileText,
              'Bulletins'
            ],
            [
              'communication',
              MessageCircle,
              'Communication'
            ],
            [
              'parametres',
              Settings,
              'Paramètres'
            ]
          ].map(
            ([
              section,
              Icon,
              label
            ]) => {
              const current =
                section as ClassSection

              const IconComponent =
                Icon as typeof Users

              return (
                <button
                  key={current}
                  type="button"
                  onClick={() =>
                    selectSection(
                      current
                    )
                  }
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
                    activeSection ===
                    current
                      ? 'bg-primary-100 text-primary-800 font-medium'
                      : 'text-primary-500 hover:bg-primary-50'
                  }`}
                >
                  <IconComponent
                    size={17}
                  />

                  {label as string}
                </button>
              )
            }
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="card border border-red-200 bg-red-50 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {activeSection ===
        'eleves' && (
        <section className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-primary-800">
                Élèves de{' '}
                {schoolClass.name}
              </h2>

              <p className="text-xs text-primary-400">
                {students.length} élève
                {students.length >
                1
                  ? 's'
                  : ''}
              </p>
            </div>
          </div>

          {students.length ===
          0 ? (
            <p className="text-sm text-primary-400">
              Aucun élève dans cette
              classe.
            </p>
          ) : (
            <div className="divide-y divide-primary-100">
              {students.map(
                (
                  student,
                  index
                ) => (
                  <button
                    key={
                      student.id
                    }
                    type="button"
                    onClick={() =>
                      navigate(
                        `/eleves/${student.id}`
                      )
                    }
                    className="w-full py-3 flex items-center gap-3 text-left hover:bg-primary-50 rounded-lg px-2"
                  >
                    <span className="w-7 text-xs text-primary-400">
                      {index + 1}
                    </span>

                    <div className="flex-1">
                      <p className="font-medium text-primary-800 text-sm">
                        {
                          student.last_name
                        }{' '}
                        {
                          student.first_name
                        }
                      </p>

                      {student.matricule && (
                        <p className="text-xs text-primary-400">
                          {
                            student.matricule
                          }
                        </p>
                      )}
                    </div>

                    <span className="text-xs text-primary-400">
                      Voir
                    </span>
                  </button>
                )
              )}
            </div>
          )}
        </section>
      )}

      {activeSection ===
        'evaluations' && (
        <>
          {showEvaluationForm && (
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-primary-800">
                  Nouvelle
                  évaluation
                </h2>

                <button
                  type="button"
                  onClick={() =>
                    setShowEvaluationForm(
                      false
                    )
                  }
                  className="p-1 text-primary-500 hover:bg-primary-50 rounded"
                  disabled={
                    savingEvaluation
                  }
                >
                  <X size={18} />
                </button>
              </div>

              <input
                className="input-field"
                placeholder="Titre (ex : Devoir 1)"
                value={
                  form.title
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    title:
                      e.target
                        .value
                  })
                }
                disabled={
                  savingEvaluation
                }
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  className="input-field"
                  value={
                    form.type
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      type: e.target
                        .value as EvaluationType
                    })
                  }
                  disabled={
                    savingEvaluation
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
                  className="input-field"
                  placeholder="Matière"
                  value={
                    form.subject
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      subject:
                        e.target
                          .value
                    })
                  }
                  disabled={
                    savingEvaluation
                  }
                />

                <input
                  type="date"
                  className="input-field"
                  value={
                    form.eval_date
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      eval_date:
                        e.target
                          .value
                    })
                  }
                  disabled={
                    savingEvaluation
                  }
                />

                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  className="input-field"
                  placeholder="Coefficient"
                  value={
                    form.coefficient
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      coefficient:
                        Number(
                          e.target
                            .value
                        )
                    })
                  }
                  disabled={
                    savingEvaluation
                  }
                />

                <input
                  type="number"
                  min="1"
                  className="input-field"
                  placeholder="Note maximale"
                  value={
                    form.max_score
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      max_score:
                        Number(
                          e.target
                            .value
                        )
                    })
                  }
                  disabled={
                    savingEvaluation
                  }
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void handleCreateEvaluation()
                  }
                  className="btn-primary text-sm disabled:opacity-50"
                  disabled={
                    savingEvaluation
                  }
                >
                  {savingEvaluation
                    ? 'Création…'
                    : 'Créer l’évaluation'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setShowEvaluationForm(
                      false
                    )
                  }
                  className="btn-secondary text-sm"
                  disabled={
                    savingEvaluation
                  }
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {selectedEvaluation ? (
            <section className="card">
              <div className="flex flex-col gap-3 pb-4 mb-3 border-b border-primary-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <button
                      type="button"
                      onClick={
                        closeEvaluation
                      }
                      className="flex items-center gap-1 text-xs text-primary-600 mb-2"
                    >
                      <ArrowLeft
                        size={14}
                      />
                      Retour aux
                      évaluations
                    </button>

                    <h2 className="font-semibold text-primary-800">
                      {
                        selectedEvaluation.title
                      }
                    </h2>

                    <p className="text-xs text-primary-400 mt-1">
                      {
                        selectedEvaluation.subject
                      }{' '}
                      ·{' '}
                      {new Date(
                        selectedEvaluation.eval_date
                      ).toLocaleDateString(
                        'fr-FR'
                      )}{' '}
                      · Coefficient{' '}
                      {
                        selectedEvaluation.coefficient
                      }
                    </p>
                  </div>

                  <span className="text-xs text-primary-400">
                    /
                    {
                      selectedEvaluation.max_score
                    }
                  </span>
                </div>

                {!loadingGrades &&
                  students.length >
                    0 && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
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
                          Meilleure /
                          faible
                        </p>

                        <p className="font-semibold text-primary-800">
                          {gradebookStats.best ===
                          null
                            ? '—'
                            : `${gradebookStats.best} / ${gradebookStats.lowest}`}
                        </p>
                      </div>
                    </div>
                  )}
              </div>

              {loadingGrades ? (
                <p className="text-sm text-primary-400 py-4">
                  Chargement des
                  notes…
                </p>
              ) : students.length ===
                0 ? (
                <p className="text-sm text-primary-400 py-4">
                  Aucun élève dans
                  cette classe.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-xs text-primary-400">
                      Saisissez les notes
                      rapidement.{' '}
                      <b>Entrée</b> passe
                      à l’élève suivant.
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        void saveAllGrades()
                      }
                      disabled={
                        savingAllGrades
                      }
                      className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                      <Save
                        size={16}
                      />

                      {savingAllGrades
                        ? 'Enregistrement…'
                        : 'Enregistrer tout'}
                    </button>
                  </div>

                  {gradesSavedMessage && (
                    <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                      {
                        gradesSavedMessage
                      }
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-sm">
                      <thead>
                        <tr className="border-b border-primary-100 text-left text-xs text-primary-400">
                          <th className="py-2 px-2 w-12">
                            N°
                          </th>

                          <th className="py-2 px-2">
                            Élève
                          </th>

                          <th className="py-2 px-2 w-32 text-center">
                            Note /
                            {
                              selectedEvaluation.max_score
                            }
                          </th>

                          <th className="py-2 px-2 w-28 text-center">
                            Absence
                          </th>

                          <th className="py-2 px-2 w-24 text-center">
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

                            const hasValue =
                              value.trim() !==
                              ''

                            return (
                              <tr
                                key={
                                  student.id
                                }
                                className={`border-b border-primary-50 ${
                                  absent
                                    ? 'bg-primary-50/60'
                                    : ''
                                }`}
                              >
                                <td className="py-2 px-2 text-xs text-primary-400">
                                  {index +
                                    1}
                                </td>

                                <td className="py-2 px-2">
                                  <p className="font-medium text-primary-800">
                                    {
                                      student.last_name
                                    }{' '}
                                    {
                                      student.first_name
                                    }
                                  </p>

                                  {student.matricule && (
                                    <p className="text-xs text-primary-400">
                                      {
                                        student.matricule
                                      }
                                    </p>
                                  )}
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
                                        e
                                          .target
                                          .value
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
                                    placeholder={
                                      absent
                                        ? 'ABS'
                                        : '—'
                                    }
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
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                                      absent
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-primary-50 text-primary-600 hover:bg-primary-100'
                                    }`}
                                  >
                                    {absent
                                      ? 'ABS'
                                      : 'Présent'}
                                  </button>
                                </td>

                                <td className="py-2 px-2 text-center">
                                  {absent ? (
                                    <span className="text-xs text-red-600">
                                      Absent
                                    </span>
                                  ) : hasValue ? (
                                    <span className="text-xs text-green-600">
                                      Saisi
                                    </span>
                                  ) : (
                                    <span className="text-xs text-primary-400">
                                      À saisir
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          }
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        void saveAllGrades()
                      }
                      disabled={
                        savingAllGrades
                      }
                      className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                      <Save
                        size={16}
                      />

                      {savingAllGrades
                        ? 'Enregistrement…'
                        : 'Enregistrer tout'}
                    </button>
                  </div>
                </>
              )}
            </section>
          ) : (
            <section className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold text-primary-800">
                    Évaluations de{' '}
                    {schoolClass.name}
                  </h2>

                  <p className="text-xs text-primary-400">
                    Cliquez sur une
                    évaluation pour
                    saisir les notes.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    resetEvaluationForm()
                    setShowEvaluationForm(
                      true
                    )
                    setErrorMessage('')
                  }}
                  className="btn-primary flex items-center gap-1 text-sm"
                >
                  <Plus size={15} />
                  Ajouter
                </button>
              </div>

              {evaluations.length ===
              0 ? (
                <p className="text-sm text-primary-400">
                  Aucune évaluation
                  pour cette classe.
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
                        className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-primary-50 rounded-lg px-2"
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
                            ·{' '}
                            {new Date(
                              evaluation.eval_date
                            ).toLocaleDateString(
                              'fr-FR'
                            )}{' '}
                            · Coeff.{' '}
                            {
                              evaluation.coefficient
                            }{' '}
                            · /
                            {
                              evaluation.max_score
                            }
                          </p>
                        </div>

                        <span className="text-xs px-2 py-1 rounded-full bg-primary-50 text-primary-600 capitalize">
                          {
                            evaluation.type
                          }
                        </span>
                      </button>
                    )
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {activeSection ===
        'resultats' && (
        <section className="card">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3
              size={20}
              className="text-primary-500"
            />

            <h2 className="font-semibold text-primary-800">
              Résultats de{' '}
              {schoolClass.name}
            </h2>
          </div>

          <p className="text-sm text-primary-500">
            Les moyennes, le
            classement et les
            statistiques de la
            classe seront regroupés
            ici.
          </p>

          <p className="text-xs text-primary-400 mt-2">
            Les données des
            évaluations existantes
            sont conservées.
          </p>
        </section>
      )}

      {activeSection ===
        'bulletins' && (
        <section className="card space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText
                size={20}
                className="text-primary-500"
              />

              <h2 className="font-semibold text-primary-800">
                Bulletins de{' '}
                {schoolClass.name}
              </h2>
            </div>

            <p className="text-sm text-primary-500">
              Les bulletins de cette
              classe seront regroupés
              ici.
            </p>
          </div>

          <div className="border border-primary-100 rounded-lg p-4">
            <p className="font-medium text-primary-800 text-sm">
              Envoi des bulletins par
              WhatsApp
            </p>

            <p className="text-xs text-primary-400 mt-1 mb-3">
              {whatsappCount} élève
              {whatsappCount > 1
                ? 's'
                : ''}{' '}
              avec un numéro
              WhatsApp.

              {missingWhatsappCount >
                0 &&
                ` ${missingWhatsappCount} sans numéro.`}
            </p>

            <ClassWhatsAppSendButton
              classId={
                schoolClass.id
              }
              className={
                schoolClass.name
              }
              profile={profile}
            />
          </div>
        </section>
      )}

      {activeSection ===
        'communication' && (
        <section className="card space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle
                size={20}
                className="text-primary-500"
              />

              <h2 className="font-semibold text-primary-800">
                Communication —{' '}
                {schoolClass.name}
              </h2>
            </div>

            <p className="text-sm text-primary-500">
              Choisissez les parents
              auxquels vous souhaitez
              envoyer un message
              WhatsApp.
            </p>
          </div>

          <div className="border border-primary-100 rounded-lg">
            <div className="p-3 border-b border-primary-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="font-medium text-primary-800 text-sm">
                  Destinataires
                </p>

                <p className="text-xs text-primary-400 mt-1">
                  {
                    selectedWhatsappStudents.length
                  }{' '}
                  sélectionné
                  {selectedWhatsappStudents.length >
                  1
                    ? 's'
                    : ''}{' '}
                  ·{' '}
                  {
                    whatsappStudents.length
                  }{' '}
                  avec WhatsApp
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={
                    selectAllCommunicationStudents
                  }
                  className="btn-secondary text-xs flex items-center gap-1"
                  disabled={
                    whatsappStudents.length ===
                    0
                  }
                >
                  <CheckSquare
                    size={14}
                  />
                  Tout sélectionner
                </button>

                <button
                  type="button"
                  onClick={
                    clearCommunicationSelection
                  }
                  className="btn-secondary text-xs"
                  disabled={
                    selectedCommunicationStudents.length ===
                    0
                  }
                >
                  Désélectionner
                </button>
              </div>
            </div>

            {whatsappStudents.length ===
            0 ? (
              <div className="p-4">
                <p className="text-sm text-primary-400">
                  Aucun numéro WhatsApp
                  de parent n'est
                  enregistré pour cette
                  classe.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-primary-100 max-h-80 overflow-y-auto">
                {whatsappStudents.map(
                  (student) => {
                    const selected =
                      selectedCommunicationStudents.includes(
                        student.id
                      )

                    return (
                      <label
                        key={
                          student.id
                        }
                        className={`flex items-center gap-3 p-3 cursor-pointer transition ${
                          selected
                            ? 'bg-primary-50'
                            : 'hover:bg-primary-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={
                            selected
                          }
                          onChange={() =>
                            toggleCommunicationStudent(
                              student.id
                            )
                          }
                          className="h-4 w-4"
                        />

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-primary-800">
                            {
                              student.last_name
                            }{' '}
                            {
                              student.first_name
                            }
                          </p>

                          <p className="text-xs text-primary-400">
                            {
                              student.parent_whatsapp
                            }
                          </p>
                        </div>
                      </label>
                    )
                  }
                )}
              </div>
            )}

            {missingWhatsappCount >
              0 && (
              <div className="p-3 border-t border-primary-100">
                <p className="text-xs text-primary-400">
                  {
                    missingWhatsappCount
                  }{' '}
                  élève
                  {missingWhatsappCount >
                  1
                    ? 's'
                    : ''}{' '}
                  sans numéro
                  WhatsApp.
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-primary-800 mb-2">
              Message
            </label>

            <textarea
              value={
                communicationMessage
              }
              onChange={(e) => {
                setCommunicationMessage(
                  e.target.value
                )

                setCommunicationResult(
                  ''
                )
              }}
              placeholder="Écrivez votre message aux parents..."
              rows={6}
              className="input-field w-full resize-y"
            />

            <p className="text-xs text-primary-400 mt-1">
              Le nom de l'élève et la
              classe seront ajoutés
              automatiquement.
            </p>
          </div>

          {communicationResult && (
            <div className="border border-primary-100 bg-primary-50 rounded-lg p-3">
              <p className="text-sm text-primary-700">
                {
                  communicationResult
                }
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              onClick={
                openWhatsAppCommunication
              }
              disabled={
                sendingCommunication ||
                selectedWhatsappStudents.length ===
                  0 ||
                !communicationMessage.trim()
              }
              className="btn-primary flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <MessageCircle
                size={17}
              />

              {sendingCommunication
                ? 'Ouverture…'
                : `Ouvrir WhatsApp pour ${selectedWhatsappStudents.length} destinataire${
                    selectedWhatsappStudents.length >
                    1
                      ? 's'
                      : ''
                  }`}
            </button>

            <span className="text-xs text-primary-400">
              WhatsApp s'ouvrira avec
              le message déjà préparé.
            </span>
          </div>
        </section>
      )}

      {activeSection ===
        'parametres' && (
        <section className="card">
          <div className="flex items-center gap-2 mb-2">
            <Settings
              size={20}
              className="text-primary-500"
            />

            <h2 className="font-semibold text-primary-800">
              Paramètres de{' '}
              {schoolClass.name}
            </h2>
          </div>

          <p className="text-sm text-primary-500">
            Paramètres propres à
            cette classe.
          </p>

          <div className="mt-4 space-y-2 text-sm text-primary-500">
            <p>
              Niveau :{' '}
              <span className="text-primary-800">
                {schoolClass.level ??
                  'Non précisé'}
              </span>
            </p>

            <p>
              Année scolaire :{' '}
              <span className="text-primary-800">
                {
                  schoolClass.school_year
                }
              </span>
            </p>

            <p>
              Élèves actifs :{' '}
              <span className="text-primary-800">
                {students.length}
              </span>
            </p>

            <p>
              Numéros WhatsApp :{' '}
              <span className="text-primary-800">
                {whatsappCount}
              </span>
            </p>
          </div>
        </section>
      )}
    </div>
  )
}