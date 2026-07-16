import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, TrendingUp, Award, TrendingDown, Users } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '@/lib/supabase'
import type { Student, StudentRanking } from '@/types/database'

interface HistoryRow {
  grade_id: string
  score: number | null
  is_absent: boolean
  evaluation_id: string
  title: string
  subject: string
  eval_date: string
  coefficient: number
  max_score: number
}

export default function StudentDetail() {
  const { studentId } = useParams<{ studentId: string }>()
  const navigate = useNavigate()

  const [student, setStudent] = useState<Student | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [ranking, setRanking] = useState<StudentRanking | null>(null)
  const [classSize, setClassSize] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (studentId) void loadData(studentId)
  }, [studentId])

  async function loadData(id: string) {
    setLoading(true)

    const { data: studentData } = await supabase.from('students').select('*').eq('id', id).single()
    setStudent(studentData as Student | null)

    if (!studentData) {
      setLoading(false)
      return
    }

    const [historyRes, rankingRes, classCountRes] = await Promise.all([
      supabase
        .from('grades')
        .select('id, score, is_absent, evaluation_id, evaluations(id, title, subject, eval_date, coefficient, max_score)')
        .eq('student_id', id),
      supabase.from('student_rankings').select('*').eq('student_id', id).single(),
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('class_id', (studentData as Student).class_id).eq('is_active', true)
    ])

    const rows: HistoryRow[] = ((historyRes.data as any[]) ?? [])
      .filter((g) => g.evaluations)
      .map((g) => ({
        grade_id: g.id,
        score: g.score,
        is_absent: g.is_absent,
        evaluation_id: g.evaluations.id,
        title: g.evaluations.title,
        subject: g.evaluations.subject,
        eval_date: g.evaluations.eval_date,
        coefficient: g.evaluations.coefficient,
        max_score: g.evaluations.max_score
      }))
      .sort((a, b) => new Date(a.eval_date).getTime() - new Date(b.eval_date).getTime())

    setHistory(rows)
    setRanking((rankingRes.data as StudentRanking) ?? null)
    setClassSize(classCountRes.count ?? 0)
    setLoading(false)
  }

  const notedRows = history.filter((r) => r.score !== null)
  const bestRow = notedRows.reduce<HistoryRow | null>((best, r) => (!best || (r.score! / r.max_score) > (best.score! / best.max_score) ? r : best), null)
  const worstRow = notedRows.reduce<HistoryRow | null>((worst, r) => (!worst || (r.score! / r.max_score) < (worst.score! / worst.max_score) ? r : worst), null)

  const chartData = notedRows.map((r) => ({
    name: new Date(r.eval_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    note: Math.round((r.score! / r.max_score) * 20 * 100) / 100
  }))

  if (loading) {
    return <p className="text-sm text-primary-400">Chargement…</p>
  }

  if (!student) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/eleves')} className="text-sm text-primary-600 flex items-center gap-1">
          <ArrowLeft size={16} /> Retour
        </button>
        <p className="text-sm text-primary-400">Élève introuvable.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/eleves')} className="text-sm text-primary-600 flex items-center gap-1">
        <ArrowLeft size={16} /> Retour aux élèves
      </button>

      <div>
        <h1 className="text-xl font-semibold text-primary-800">{student.last_name} {student.first_name}</h1>
        <p className="text-sm text-primary-500">
          {student.gender ?? ''} {student.parent_whatsapp ? `· Parent : ${student.parent_whatsapp}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card text-center">
          <TrendingUp size={16} className="mx-auto text-primary-400 mb-1" />
          <p className="text-lg font-bold text-primary-800">{ranking?.average ?? '—'}</p>
          <p className="text-xs text-primary-500">Moyenne générale</p>
        </div>
        <div className="card text-center">
          <Users size={16} className="mx-auto text-primary-400 mb-1" />
          <p className="text-lg font-bold text-primary-800">{ranking ? `${ranking.rank}/${classSize}` : '—'}</p>
          <p className="text-xs text-primary-500">Classement</p>
        </div>
        <div className="card text-center">
          <Award size={16} className="mx-auto text-success mb-1" />
          <p className="text-lg font-bold text-primary-800">{bestRow ? `${bestRow.score}/${bestRow.max_score}` : '—'}</p>
          <p className="text-xs text-primary-500">Meilleure note</p>
        </div>
        <div className="card text-center">
          <TrendingDown size={16} className="mx-auto text-danger mb-1" />
          <p className="text-lg font-bold text-primary-800">{worstRow ? `${worstRow.score}/${worstRow.max_score}` : '—'}</p>
          <p className="text-xs text-primary-500">Plus faible note</p>
        </div>
      </div>

      {chartData.length >= 2 && (
        <div className="card">
          <h2 className="font-semibold text-primary-800 mb-3">Évolution (notes ramenées sur 20)</h2>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF3F8" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="note" stroke="#1E3A5F" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold text-primary-800 mb-3">Historique des évaluations</h2>
        {history.length === 0 ? (
          <p className="text-sm text-primary-400">Aucune évaluation enregistrée pour cet élève.</p>
        ) : (
          <ul className="divide-y divide-primary-100">
            {[...history].reverse().map((r) => (
              <li key={r.grade_id} className="py-2.5 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-primary-800">{r.title}</p>
                  <p className="text-xs text-primary-400">
                    {r.subject} · {new Date(r.eval_date).toLocaleDateString('fr-FR')} · Coeff. {r.coefficient}
                  </p>
                </div>
                <span className={`text-sm font-semibold ${r.is_absent ? 'text-primary-300' : 'text-primary-800'}`}>
                  {r.is_absent ? 'Absent' : r.score !== null ? `${r.score}/${r.max_score}` : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
