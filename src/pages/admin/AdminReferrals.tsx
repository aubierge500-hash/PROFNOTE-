import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'
import type { ReferralWithdrawal } from '@/lib/referral'

interface TeacherInfo {
  id: string
  full_name: string | null
  email: string | null
}

const STATUS_LABEL: Record<ReferralWithdrawal['status'], string> = {
  pending: 'À payer',
  paid: 'Payé',
  rejected: 'Refusé'
}

function formatFcfa(value: number) {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR')
}

export default function AdminReferrals() {
  const { user, profile } = useAuth()

  const [withdrawals, setWithdrawals] = useState<ReferralWithdrawal[]>([])
  const [teachers, setTeachers] = useState<Record<string, TeacherInfo>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [withdrawalsResult, teachersResult] = await Promise.all([
        supabase
          .from('referral_withdrawals')
          .select('id, user_id, amount, phone, status, created_at, processed_at, note')
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name, email')
      ])

      if (withdrawalsResult.error) throw withdrawalsResult.error
      if (teachersResult.error) throw teachersResult.error

      const map: Record<string, TeacherInfo> = {}
      for (const t of (teachersResult.data ?? []) as TeacherInfo[]) map[t.id] = t

      setTeachers(map)
      setWithdrawals((withdrawalsResult.data ?? []) as ReferralWithdrawal[])
    } catch (err) {
      console.error('[Admin parrainages]', err)
      setError('Impossible de charger les demandes de retrait. Vérifiez votre connexion puis réessayez.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && profile?.role === 'admin') void loadData()
    else setLoading(false)
  }, [user, profile?.role, loadData])

  if (!user) return <Navigate to="/connexion" replace />

  if (profile?.role !== 'admin') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-primary-50 p-4">
        <section className="max-w-md rounded-xl border bg-white p-6 text-center">
          <h1 className="text-xl font-bold text-primary-800">Accès réservé</h1>
          <p className="mt-2 text-sm text-primary-600">Cette page est réservée à l’administration de PROFNOTE.</p>
        </section>
      </main>
    )
  }

  async function process(w: ReferralWithdrawal, status: 'paid' | 'rejected') {
    const name = teachers[w.user_id]?.full_name || teachers[w.user_id]?.email || 'cet enseignant'
    let note: string | null = null

    if (status === 'paid') {
      if (!window.confirm(`Confirmer que ${formatFcfa(w.amount)} ont bien été envoyés à ${name} (${w.phone}) ?`)) return
    } else {
      note = window.prompt(`Motif du refus pour ${name} (affiché à l'enseignant) :`, '')
      if (note === null) return
    }

    setBusyId(w.id)
    setError('')
    setSuccess('')

    try {
      const { error: updateError } = await supabase
        .from('referral_withdrawals')
        .update({ status, processed_at: new Date().toISOString(), note: note?.trim() || null })
        .eq('id', w.id)
        .eq('status', 'pending')

      if (updateError) throw updateError

      setSuccess(status === 'paid' ? `Retrait de ${name} marqué comme payé.` : `Retrait de ${name} refusé.`)
      await loadData()
    } catch (err) {
      console.error('[Admin parrainages] Mise à jour impossible :', err)
      setError("L'opération a échoué. Réessayez.")
    } finally {
      setBusyId(null)
    }
  }

  const pending = withdrawals.filter((w) => w.status === 'pending')
  const history = withdrawals.filter((w) => w.status !== 'pending')
  const pendingTotal = pending.reduce((sum, w) => sum + w.amount, 0)

  return (
    <main className="min-h-screen bg-primary-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary-500">PROFNOTE · ADMINISTRATION</p>
            <h1 className="mt-2 text-2xl font-bold text-primary-800">Retraits de parrainage</h1>
            <p className="mt-2 text-sm text-primary-600">
              Envoyez l’argent par Mobile Money, puis marquez la demande comme payée.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/" className="btn-secondary text-sm">
              Retour à l’application
            </Link>
            <button type="button" onClick={() => void loadData()} disabled={loading} className="btn-secondary text-sm disabled:opacity-50">
              {loading ? 'Chargement…' : 'Actualiser'}
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            {success}
          </div>
        )}

        <section className="card">
          <p className="text-sm text-primary-600">
            Demandes à payer : <strong className="text-primary-800">{pending.length}</strong> · Total :{' '}
            <strong className="text-primary-800">{formatFcfa(pendingTotal)}</strong>
          </p>
        </section>

        {loading ? (
          <div className="rounded-xl bg-white p-8 text-center text-primary-600">Chargement…</div>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-primary-800">À payer</h2>
              {pending.length === 0 ? (
                <div className="rounded-xl border border-primary-100 bg-white p-6 text-center text-sm text-primary-600">
                  Aucune demande en attente.
                </div>
              ) : (
                pending.map((w) => {
                  const t = teachers[w.user_id]
                  return (
                    <article key={w.id} className="rounded-xl border border-primary-100 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <h3 className="break-words font-semibold text-primary-800">{t?.full_name || 'Nom non renseigné'}</h3>
                          <p className="break-all text-sm text-primary-600">{t?.email}</p>
                          <p className="mt-1 text-sm text-primary-700">
                            <strong>{formatFcfa(w.amount)}</strong> → {w.phone}
                          </p>
                          <p className="text-xs text-primary-500">Demandé le {formatDate(w.created_at)}</p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button type="button" disabled={busyId === w.id} onClick={() => void process(w, 'paid')} className="btn-primary text-sm">
                            {busyId === w.id ? 'Traitement…' : 'Marquer payé'}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === w.id}
                            onClick={() => void process(w, 'rejected')}
                            className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Refuser
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })
              )}
            </section>

            {history.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-primary-800">Historique</h2>
                <ul className="space-y-2">
                  {history.map((w) => {
                    const t = teachers[w.user_id]
                    return (
                      <li key={w.id} className="flex items-center justify-between gap-3 rounded-lg border border-primary-100 bg-white p-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-primary-800">{t?.full_name || t?.email || 'Enseignant'}</p>
                          <p className="text-xs text-primary-500">
                            {formatFcfa(w.amount)} · {w.phone} · {formatDate(w.processed_at ?? w.created_at)}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-primary-700">{STATUS_LABEL[w.status]}</span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
