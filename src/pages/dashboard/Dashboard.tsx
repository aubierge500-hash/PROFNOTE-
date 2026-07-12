import { useEffect, useState } from 'react'
import { School, Users, ClipboardList, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import type { Evaluation } from '@/types/database'

interface Stats {
  nbClasses: number
  nbStudents: number
  nbEvaluations: number
  averageGeneral: number | null
}

export default function Dashboard() {
  const { user, profile } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentEvaluations, setRecentEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    void loadDashboard(user.id)
  }, [user])

  async function loadDashboard(teacherId: string) {
    setLoading(true)

    const [classesRes, studentsRes, evaluationsRes, averagesRes, recentRes] = await Promise.all([
      supabase.from('classes').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('is_archived', false),
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId).eq('is_active', true),
      supabase.from('evaluations').select('id', { count: 'exact', head: true }).eq('teacher_id', teacherId),
      supabase.from('student_averages').select('average').eq('teacher_id', teacherId),
      supabase
        .from('evaluations')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('eval_date', { ascending: false })
        .limit(5)
    ])

    const averages = (averagesRes.data ?? []).map((r: any) => r.average).filter((a: number | null) => a !== null)
    const averageGeneral = averages.length
      ? Math.round((averages.reduce((sum: number, a: number) => sum + a, 0) / averages.length) * 100) / 100
      : null

    setStats({
      nbClasses: classesRes.count ?? 0,
      nbStudents: studentsRes.count ?? 0,
      nbEvaluations: evaluationsRes.count ?? 0,
      averageGeneral
    })
    setRecentEvaluations((recentRes.data as Evaluation[]) ?? [])
    setLoading(false)
  }

  const cards = [
    { label: 'Classes', value: stats?.nbClasses ?? 0, icon: School },
    { label: 'Élèves', value: stats?.nbStudents ?? 0, icon: Users },
    { label: 'Évaluations', value: stats?.nbEvaluations ?? 0, icon: ClipboardList },
    { label: 'Moyenne générale', value: stats?.averageGeneral !== null && stats?.averageGeneral !== undefined ? `${stats.averageGeneral}/20` : '—', icon: TrendingUp }
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary-800">
          Bonjour {profile?.full_name?.split(' ')[0] ?? ''} 👋
        </h1>
        <p className="text-sm text-primary-500">Voici un aperçu de votre activité</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card">
            <Icon size={18} className="text-primary-400 mb-2" />
            <p className="text-2xl font-display font-bold text-primary-800">{loading ? '…' : value}</p>
            <p className="text-xs text-primary-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="font-semibold text-primary-800 mb-3">Dernières évaluations</h2>
        {loading ? (
          <p className="text-sm text-primary-400">Chargement…</p>
        ) : recentEvaluations.length === 0 ? (
          <p className="text-sm text-primary-400">
            Aucune évaluation pour le moment. Créez votre première évaluation depuis l'onglet « Évaluations ».
          </p>
        ) : (
          <ul className="divide-y divide-primary-100">
            {recentEvaluations.map((ev) => (
              <li key={ev.id} className="py-2.5 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-primary-800">{ev.title}</p>
                  <p className="text-primary-400 text-xs">
                    {ev.subject} · {new Date(ev.eval_date).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-primary-50 text-primary-600 capitalize">
                  {ev.type}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
