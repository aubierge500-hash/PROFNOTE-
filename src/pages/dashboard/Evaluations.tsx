import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import type { Evaluation, EvaluationStats, SchoolClass, Student, Grade, EvaluationType } from '@/types/database'

export default function Evaluations() {
  const { user } = useAuth()
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [selected, setSelected] = useState<Evaluation | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [grades, setGrades] = useState<Record<string, Grade>>({})
  const [stats, setStats] = useState<EvaluationStats | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    title: '', type: 'interrogation' as EvaluationType, subject: '', class_id: '', coefficient: 1, max_score: 20, eval_date: new Date().toISOString().slice(0, 10)
  })

  useEffect(() => { if (user) void init() }, [user])
  useEffect(() => { if (selected) void loadGrades(selected) }, [selected])

  async function init() {
    const [classesRes, evalRes] = await Promise.all([
      supabase.from('classes').select('*').eq('teacher_id', user!.id).eq('is_archived', false).order('name'),
      supabase.from('evaluations').select('*').eq('teacher_id', user!.id).order('eval_date', { ascending: false })
    ])
    setClasses((classesRes.data as SchoolClass[]) ?? [])
    setEvaluations((evalRes.data as Evaluation[]) ?? [])
  }

  async function loadGrades(ev: Evaluation) {
    const [studentsRes, gradesRes, statsRes] = await Promise.all([
      supabase.from('students').select('*').eq('class_id', ev.class_id).eq('is_active', true).order('last_name'),
      supabase.from('grades').select('*').eq('evaluation_id', ev.id),
      supabase.from('evaluation_stats').select('*').eq('evaluation_id', ev.id).single()
    ])
    setStudents((studentsRes.data as Student[]) ?? [])
    const map: Record<string, Grade> = {}
    for (const g of (gradesRes.data as Grade[]) ?? []) map[g.student_id] = g
    setGrades(map)
    setStats((statsRes.data as EvaluationStats) ?? null)
  }

  async function handleCreate() {
    if (!form.title.trim() || !form.class_id || !form.subject.trim()) return
    const { data } = await supabase.from('evaluations').insert({ teacher_id: user!.id, ...form }).select().single()
    setShowForm(false)
    await init()
    if (data) setSelected(data as Evaluation)
  }

  async function handleScoreChange(studentId: string, value: string) {
    if (!selected) return
    const score = value === '' ? null : Number(value)
    const existing = grades[studentId]

    if (existing) {
      await supabase.from('grades').update({ score, source: 'manual' }).eq('id', existing.id)
    } else {
      await supabase.from('grades').insert({ teacher_id: user!.id, evaluation_id: selected.id, student_id: studentId, score, source: 'manual' })
    }
    void loadGrades(selected)
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)} className="text-sm text-primary-600">← Retour aux évaluations</button>
        <div>
          <h1 className="text-xl font-semibold text-primary-800">{selected.title}</h1>
          <p className="text-sm text-primary-500">{selected.subject} · {new Date(selected.eval_date).toLocaleDateString('fr-FR')} · Coeff. {selected.coefficient} · /{selected.max_score}</p>
        </div>

        {stats && (
          <div className="grid grid-cols-4 gap-3">
            <div className="card text-center"><p className="text-lg font-bold text-primary-800">{stats.class_average ?? '—'}</p><p className="text-xs text-primary-400">Moyenne</p></div>
            <div className="card text-center"><p className="text-lg font-bold text-primary-800">{stats.best_score ?? '—'}</p><p className="text-xs text-primary-400">Meilleure</p></div>
            <div className="card text-center"><p className="text-lg font-bold text-primary-800">{stats.lowest_score ?? '—'}</p><p className="text-xs text-primary-400">Plus faible</p></div>
            <div className="card text-center"><p className="text-lg font-bold text-primary-800">{stats.nb_graded}</p><p className="text-xs text-primary-400">Notés</p></div>
          </div>
        )}

        <div className="card divide-y divide-primary-100">
          {students.map((s) => (
            <div key={s.id} className="py-2.5 flex items-center justify-between text-sm gap-3">
              <p className="font-medium text-primary-800">{s.last_name} {s.first_name}</p>
              <input
                type="number"
                min={0}
                max={selected.max_score}
                step={0.25}
                className="input-field w-24 text-center"
                defaultValue={grades[s.id]?.score ?? ''}
                onBlur={(e) => handleScoreChange(s.id, e.target.value)}
                placeholder="—"
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-primary-800">Évaluations</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16} /> Nouvelle évaluation
        </button>
      </div>

      {showForm && (
        <div className="card space-y-3">
          <input className="input-field" placeholder="Titre (ex: Interro n°3)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EvaluationType })}>
              <option value="interrogation">Interrogation</option>
              <option value="devoir">Devoir</option>
              <option value="composition">Composition</option>
              <option value="examen">Examen</option>
            </select>
            <input className="input-field" placeholder="Matière" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <select className="input-field" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
              <option value="">Classe</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" className="input-field" value={form.eval_date} onChange={(e) => setForm({ ...form, eval_date: e.target.value })} />
            <input type="number" step={0.5} className="input-field" placeholder="Coefficient" value={form.coefficient} onChange={(e) => setForm({ ...form, coefficient: Number(e.target.value) })} />
            <input type="number" className="input-field" placeholder="Note sur" value={form.max_score} onChange={(e) => setForm({ ...form, max_score: Number(e.target.value) })} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="btn-primary text-sm">Créer</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">Annuler</button>
          </div>
        </div>
      )}

      <div className="card divide-y divide-primary-100">
        {evaluations.length === 0 ? (
          <p className="text-sm text-primary-400">Aucune évaluation créée.</p>
        ) : evaluations.map((ev) => (
          <button key={ev.id} onClick={() => setSelected(ev)} className="w-full py-2.5 flex items-center justify-between text-sm text-left">
            <div>
              <p className="font-medium text-primary-800">{ev.title}</p>
              <p className="text-xs text-primary-400">{ev.subject} · {new Date(ev.eval_date).toLocaleDateString('fr-FR')}</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-primary-50 text-primary-600 capitalize">{ev.type}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
