import { useEffect, useState } from 'react'
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
  Save
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

  const [schoolClass, setSchoolClass] =
    useState<SchoolClass | null>(null)

  const [students, setStudents] = useState<Student[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])

  const [selectedEvaluation, setSelectedEvaluation] =
    useState<Evaluation | null>(null)

  const [grades, setGrades] =
    useState<Record<string, Grade>>({})

  const [activeSection, setActiveSection] =
    useState<ClassSection>('eleves')

  const [loading, setLoading] = useState(true)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [savingGrade, setSavingGrade] =
    useState<string | null>(null)

  const [errorMessage, setErrorMessage] = useState('')

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

  async function openEvaluation(evaluation: Evaluation) {
    if (!user) return

    setSelectedEvaluation(evaluation)
    setActiveSection('evaluations')
    setLoadingGrades(true)
    setErrorMessage('')

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
      setLoadingGrades(false)
      return
    }

    const gradeMap: Record<string, Grade> = {}

    for (const grade of (data as Grade[]) ?? []) {
      gradeMap[grade.student_id] = grade
    }

    setGrades(gradeMap)
    setLoadingGrades(false)
  }

  function closeEvaluation() {
    setSelectedEvaluation(null)
    setGrades({})
    setErrorMessage('')
  }

  async function saveGrade(
    studentId: string,
    value: string
  ) {
    if (!user || !selectedEvaluation) return

    const existing = grades[studentId]
    const trimmedValue = value.trim()

    if (trimmedValue === '') {
      if (existing) {
        setSavingGrade(studentId)

        const { error } = await supabase
          .from('grades')
          .delete()
          .eq('id', existing.id)
          .eq('teacher_id', user.id)

        setSavingGrade(null)

        if (error) {
          setErrorMessage(
            `Impossible de supprimer la note : ${error.message}`
          )
          return
        }

        const updated = { ...grades }
        delete updated[studentId]
        setGrades(updated)
      }

      return
    }

    const score = Number(trimmedValue)

    if (
      Number.isNaN(score) ||
      score < 0 ||
      score > selectedEvaluation.max_score
    ) {
      setErrorMessage(
        `La note doit être comprise entre 0 et ${selectedEvaluation.max_score}.`
      )
      return
    }

    setSavingGrade(studentId)
    setErrorMessage('')

    try {
      if (existing) {
        const { data, error } = await supabase
          .from('grades')
          .update({
            score,
            source: 'manual'
          })
          .eq('id', existing.id)
          .eq('teacher_id', user.id)
          .select()
          .single()

        if (error) throw error

        setGrades((current) => ({
          ...current,
          [studentId]: data as Grade
        }))
      } else {
        const { data, error } = await supabase
          .from('grades')
          .insert({
            teacher_id: user.id,
            evaluation_id: selectedEvaluation.id,
            student_id: studentId,
            score,
            source: 'manual'
          })
          .select()
          .single()

        if (error) throw error

        setGrades((current) => ({
          ...current,
          [studentId]: data as Grade
        }))
      }
    } catch (error) {
      console.error(
        '[ClassDetail] Erreur sauvegarde note :',
        error
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Impossible de sauvegarder la note.'
      )
    } finally {
      setSavingGrade(null)
    }
  }

  function resetEvaluationForm() {
    setForm({
      title: '',
      type: 'interrogation',
      subject: '',
      eval_date: new Date().toISOString().slice(0, 10),
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
      setErrorMessage('La matière est obligatoire.')
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
      const { data, error } = await supabase
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
        await openEvaluation(data as Evaluation)
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

  function selectSection(section: ClassSection) {
    setActiveSection(section)

    if (section !== 'evaluations') {
      setSelectedEvaluation(null)
      setGrades({})
    }

    setErrorMessage('')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/classes')}
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
          onClick={() => navigate('/classes')}
          className="flex items-center gap-1 text-sm text-primary-600"
        >
          <ArrowLeft size={16} />
          Retour aux classes
        </button>

        <div className="card border border-red-200 bg-red-50 text-sm text-red-700">
          {errorMessage || 'Classe introuvable.'}
        </div>
      </div>
    )
  }

  const gradedCount = students.filter(
    (student) =>
      grades[student.id]?.score !== null &&
      grades[student.id]?.score !== undefined
  ).length

  const whatsappCount = students.filter(
    (student) =>
      Boolean(
        student.parent_whatsapp &&
          student.parent_whatsapp.trim() !== ''
      )
  ).length

  const missingWhatsappCount =
    students.length - whatsappCount

  return (
    <div className="space-y-5">
      {/* EN-TÊTE */}
      <div>
        <button
          onClick={() => navigate('/classes')}
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
              {schoolClass.level ?? 'Niveau non précisé'}
              {' · '}
              {schoolClass.school_year}
            </p>
          </div>

          <button
            onClick={() => {
              resetEvaluationForm()
              setShowEvaluationForm(true)
              setActiveSection('evaluations')
              setErrorMessage('')
            }}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus size={16} />
            Évaluation
          </button>
        </div>
      </div>

      {/* RÉSUMÉ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => selectSection('eleves')}
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
          onClick={() => selectSection('evaluations')}
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
          onClick={() => selectSection('resultats')}
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
          onClick={() => selectSection('bulletins')}
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

      {/* MENU DE LA CLASSE */}
      <div className="card p-2">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-1">
          <button
            type="button"
            onClick={() => selectSection('eleves')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
              activeSection === 'eleves'
                ? 'bg-primary-100 text-primary-800 font-medium'
                : 'text-primary-500 hover:bg-primary-50'
            }`}
          >
            <Users size={17} />
            Élèves
          </button>

          <button
            type="button"
            onClick={() => selectSection('evaluations')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
              activeSection === 'evaluations'
                ? 'bg-primary-100 text-primary-800 font-medium'
                : 'text-primary-500 hover:bg-primary-50'
            }`}
          >
            <ClipboardList size={17} />
            Évaluations
          </button>

          <button
            type="button"
            onClick={() => selectSection('resultats')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
              activeSection === 'resultats'
                ? 'bg-primary-100 text-primary-800 font-medium'
                : 'text-primary-500 hover:bg-primary-50'
            }`}
          >
            <BarChart3 size={17} />
            Résultats
          </button>

          <button
            type="button"
            onClick={() => selectSection('bulletins')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
              activeSection === 'bulletins'
                ? 'bg-primary-100 text-primary-800 font-medium'
                : 'text-primary-500 hover:bg-primary-50'
            }`}
          >
            <FileText size={17} />
            Bulletins
          </button>

          <button
            type="button"
            onClick={() => selectSection('communication')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
              activeSection === 'communication'
                ? 'bg-primary-100 text-primary-800 font-medium'
                : 'text-primary-500 hover:bg-primary-50'
            }`}
          >
            <MessageCircle size={17} />
            Communication
          </button>

          <button
            type="button"
            onClick={() => selectSection('parametres')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition ${
              activeSection === 'parametres'
                ? 'bg-primary-100 text-primary-800 font-medium'
                : 'text-primary-500 hover:bg-primary-50'
            }`}
          >
            <Settings size={17} />
            Paramètres
          </button>
        </div>
      </div>

      {/* ERREUR */}
      {errorMessage && (
        <div className="card border border-red-200 bg-red-50 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* ÉLÈVES */}
      {activeSection === 'eleves' && (
        <section className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-primary-800">
                Élèves de {schoolClass.name}
              </h2>

              <p className="text-xs text-primary-400">
                {students.length} élève
                {students.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {students.length === 0 ? (
            <p className="text-sm text-primary-400">
              Aucun élève dans cette classe.
            </p>
          ) : (
            <div className="divide-y divide-primary-100">
              {students.map((student, index) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() =>
                    navigate(`/eleves/${student.id}`)
                  }
                  className="w-full py-3 flex items-center gap-3 text-left hover:bg-primary-50 rounded-lg px-2"
                >
                  <span className="w-7 text-xs text-primary-400">
                    {index + 1}
                  </span>

                  <div className="flex-1">
                    <p className="font-medium text-primary-800 text-sm">
                      {student.last_name}{' '}
                      {student.first_name}
                    </p>

                    {student.matricule && (
                      <p className="text-xs text-primary-400">
                        {student.matricule}
                      </p>
                    )}
                  </div>

                  <span className="text-xs text-primary-400">
                    Voir
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ÉVALUATIONS */}
      {activeSection === 'evaluations' && (
        <>
          {showEvaluationForm && (
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-primary-800">
                  Nouvelle évaluation
                </h2>

                <button
                  type="button"
                  onClick={() =>
                    setShowEvaluationForm(false)
                  }
                  className="p-1 text-primary-500 hover:bg-primary-50 rounded"
                  disabled={savingEvaluation}
                >
                  <X size={18} />
                </button>
              </div>

              <input
                className="input-field"
                placeholder="Titre (ex : Devoir 1)"
                value={form.title}
                onChange={(e) =>
                  setForm({
                    ...form,
                    title: e.target.value
                  })
                }
                disabled={savingEvaluation}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  className="input-field"
                  value={form.type}
                  onChange={(e) =>
                    setFo