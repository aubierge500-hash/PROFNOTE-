
import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  validateEvaluationMaxScore,
  validateGrade,
} from '@/lib/gradeValidation'
import type {
  Evaluation,
  EvaluationStats,
  SchoolClass,
  Student,
  Grade,
  EvaluationType,
} from '@/types/database'

export default function Evaluations() {
  const { user } = useAuth()

  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [selected, setSelected] = useState<Evaluation | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [grades, setGrades] = useState<Record<string, Grade>>({})
  const [stats, setStats] = useState<EvaluationStats | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    type: 'interrogation' as EvaluationType,
    subject: '',
    class_id: '',
    coefficient: 1,
    max_score: 20,
    eval_date: new Date().toISOString().slice(0, 10),
  })

  useEffect(() => {
    if (user) void init()
  }, [user])

  useEffect(() => {
    if (selected) void loadGrades(selected)
  }, [selected])

  async function init() {
    if (!user) return

    const [classesRes, evalRes] = await Promise.all([
      supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('is_archived', false)
        .order('name'),
      supabase
        .from('evaluations')
        .select('*')
        .eq('teacher_id', user.id)
        .order('eval_date', { ascending: false }),
    ])

    if (classesRes.error) {
      setErrorMessage('Impossible de charger les classes.')
      return
    }

    if (evalRes.error) {
      setErrorMessage('Impossible de charger les évaluations.')
      return
    }

    setClasses((classesRes.data as SchoolClass[]) ?? [])
    setEvaluations((evalRes.data as Evaluation[]) ?? [])
  }

  async function loadGrades(ev: Evaluation) {
    const [studentsRes, gradesRes, statsRes] = await Promise.all([
      supabase
        .from('students')
        .select('*')
        .eq('class_id', ev.class_id)
        .eq('is_active', true)
        .order('last_name'),
      supabase
        .from('grades')
        .select('*')
        .eq('evaluation_id', ev.id),
      supabase
        .from('evaluation_stats')
        .select('*')
        .eq('evaluation_id', ev.id)
        .maybeSingle(),
    ])

    if (studentsRes.error || gradesRes.error) {
      setErrorMessage('Impossible de charger les élèves ou les notes.')
      return
    }

    setStudents((studentsRes.data as Student[]) ?? [])

    const map: Record<string, Grade> = {}

    for (const grade of (gradesRes.data as Grade[]) ?? []) {
      map[grade.student_id] = grade
    }

    setGrades(map)
    setStats((statsRes.data as EvaluationStats) ?? null)
  }

  async function handleCreate() {
    if (!user) return

    setErrorMessage('')

    if (!form.title.trim() || !form.class_id || !form.subject.trim()) {
      setErrorMessage('Renseigne le titre, la matière et la classe.')
      return
    }

    const maxValidation = validateEvaluationMaxScore(form.max_score)

    if (!maxValidation.valid) {
      setErrorMessage(
        maxValidation.message ??
          'La note maximale doit être comprise entre 1 et 20.'
      )
      return
    }

    if (!Number.isFinite(form.coefficient) || form.coefficient <= 0) {
      setErrorMessage('Le coefficient doit être supérieur à 0.')
      return
    }

    const { data, error } = await supabase
      .from('evaluations')
      .insert({
        teacher_id: user.id,
        ...form,
        title: form.title.trim(),
        subject: form.subject.trim(),
      })
      .select()
      .single()

    if (error) {
      setErrorMessage('Échec de la création de l’évaluation.')
      return
    }

    setShowForm(false)
    setForm({
      title: '',
      type: 'interrogation',
      subject: '',
      class_id: '',
      coefficient: 1,
      max_score: 20,
      eval_date: new Date().toISOString().slice(0, 10),
    })

    await init()

    if (data) {
      setSelected(data as Evaluation)
    }
  }

  async function handleScoreChange(
    studentId: string,
    value: string
  ) {
    if (!user || !selected) return

    setErrorMessage('')

    const student = students.find((item) => item.id === studentId)

    if (!student) {
      setErrorMessage('Élève introuvable.')
      return
    }

    const studentName = `${student.last_name} ${student.first_name}`.trim()

    const validation = validateGrade(
      value,
      selected.max_score,
      studentName
    )

    if (!validation.valid) {
      setErrorMessage(
        validation.message ?? `Note invalide pour ${studentName}.`
      )
      return
    }

    setSavingStudentId(studentId)

    const existing = grades[studentId]

    const result = existing
      ? await supabase
          .from('grades')
          .update({
            score: validation.score,
            source: 'manual',
          })
          .eq('id', existing.id)
      : await supabase
          .from('grades')
          .insert({
            teacher_id: user.id,
            evaluation_id: selected.id,
            student_id: studentId,
            score: validation.score,
            source: 'manual',
          })

    setSavingStudentId(null)

    if (result.error) {
      setErrorMessage(
        `Impossible d'enregistrer la note de ${studentName}.`
      )
      return
    }

    await loadGrades(selected)
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => {
            setSelected(null)
            setErrorMessage('')
          }}
          className="text-sm text-primary-600"
        >
          ← Retour aux évaluations
        </button>

        <div>
          <h1 className="text-xl font-semibold text-primary-800">
            {selected.title}
          </h1>
          <p className="text-sm text-primary-500">
            {selected.subject} ·{' '}
            {new Date(selected.eval_date).toLocaleDateString('fr-FR')} ·
            Coeff. {selected.coefficient} · /{selected.max_score}
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card text-center">
              <p className="text-lg font-bold text-primary-800">
                {stats.class_average ?? '—'}
              </p>
              <p className="text-xs text-primary-400">Moyenne</p>
            </div>

            <div className="card text-center">
              <p className="text-lg font-bold text-primary-800">
                {stats.best_score ?? '—'}
              </p>
              <p className="text-xs text-primary-400">Meilleure</p>
            </div>

            <div className="card text-center">
              <p className="text-lg font-bold text-primary-800">
                {stats.lowest_score ?? '—'}
              </p>
              <p className="text-xs text-primary-400">Plus faible</p>
            </div>

            <div className="card text-center">
              <p className="text-lg font-bold text-primary-800">
                {stats.nb_graded}
              </p>
              <p className="text-xs text-primary-400">Notés</p>
            </div>
          </div>
        )}

        <div className="card divide-y divide-primary-100">
          {students.length === 0 ? (
            <p className="py-3 text-sm text-primary-400">
              Aucun élève actif dans cette classe.
            </p>
          ) : (
            students.map((student) => (
              <div
                key={student.id}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <p className="min-w-0 flex-1 font-medium text-primary-800">
                  {student.last_name} {student.first_name}
                </p>

                <div className="flex shrink-0 items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={Math.min(selected.max_score, 20)}
                    step={0.25}
                    className="input-field w-24 text-center"
                    defaultValue={grades[student.id]?.score ?? ''}
                    onBlur={(event) =>
                      void handleScoreChange(
                        student.id,
                        event.target.value
                      )
                    }
                    placeholder="—"
                    aria-label={`Note de ${student.last_name} ${student.first_name}`}
                    disabled={savingStudentId === student.id}
                  />

                  {savingStudentId === student.id && (
                    <span className="text-xs text-primary-500">
                      Enregistrement…
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-primary-500">
          Saisis une note comprise entre 0 et {selected.max_score}.
          Laisse le champ vide si la note n’est pas encore renseignée.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-primary-800">
          Évaluations
        </h1>

        <button
          onClick={() => {
            setErrorMessage('')
            setShowForm(true)
          }}
          className="btn-primary flex items-center gap-1.5 text-sm"
        >
          <Plus size={16} />
          Nouvelle évaluation
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      )}

      {showForm && (
        <div className="card space-y-3">
          <input
            className="input-field"
            placeholder="Titre (ex. : Interro n°3)"
            value={form.title}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              className="input-field"
              value={form.type}
              onChange={(event) =>
                setForm({
                  ...form,
                  type: event.target.value as EvaluationType,
                })
              }
            >
              <option value="interrogation">Interrogation</option>
              <option value="devoir">Devoir</option>
              <option value="composition">Composition</option>
              <option value="examen">Examen</option>
            </select>

            <input
              className="input-field"
              placeholder="Matière"
              value={form.subject}
              onChange={(event) =>
                setForm({ ...form, subject: event.target.value })
              }
            />

            <select
              className="input-field"
              value={form.class_id}
              onChange={(event) =>
                setForm({ ...form, class_id: event.target.value })
              }
            >
              <option value="">Classe</option>
              {classes.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {schoolClass.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              className="input-field"
              value={form.eval_date}
              onChange={(event) =>
                setForm({ ...form, eval_date: event.target.value })
              }
            />

            <input
              type="number"
              min={0.5}
              step={0.5}
              className="input-field"
              placeholder="Coefficient"
              value={form.coefficient}
              onChange={(event) =>
                setForm({
                  ...form,
                  coefficient:
                    event.target.value === ''
                      ? 0
                      : Number(event.target.value),
                })
              }
            />

            <input
              type="number"
              min={1}
              max={20}
              step={0.25}
              className="input-field"
              placeholder="Note maximale"
              value={form.max_score}
              onChange={(event) =>
                setForm({
                  ...form,
                  max_score:
                    event.target.value === ''
                      ? 0
                      : Number(event.target.value),
                })
              }
            />
          </div>

          <p className="text-xs text-primary-500">
            La note maximale doit être comprise entre 1 et 20.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => void handleCreate()}
              className="btn-primary text-sm"
            >
              Créer
            </button>

            <button
              onClick={() => {
                setShowForm(false)
                setErrorMessage('')
              }}
              className="btn-secondary text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="card divide-y divide-primary-100">
        {evaluations.length === 0 ? (
          <p className="text-sm text-primary-400">
            Aucune évaluation créée.
          </p>
        ) : (
          evaluations.map((evaluation) => (
            <button
              key={evaluation.id}
              onClick={() => {
                setErrorMessage('')
                setSelected(evaluation)
              }}
              className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm"
            >
              <div>
                <p className="font-medium text-primary-800">
                  {evaluation.title}
                </p>
                <p className="text-xs text-primary-400">
                  {evaluation.subject} ·{' '}
                  {new Date(evaluation.eval_date).toLocaleDateString('fr-FR')}
                  {' · /'}
                  {evaluation.max_score}
                </p>
              </div>

              <span className="rounded-full bg-primary-50 px-2 py-1 text-xs capitalize text-primary-600">
                {evaluation.type}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
