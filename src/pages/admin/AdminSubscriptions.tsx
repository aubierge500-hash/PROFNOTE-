
import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'

interface Teacher {
  id: string
  full_name: string | null
  email: string | null
  created_at: string
}

interface Subscription {
  user_id: string
  status: 'trial' | 'active' | 'expired'
  paid_until: string | null
  payment_note: string | null
}

export default function AdminSubscriptions() {
  const { user, profile } = useAuth()

  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [teachersResult, subscriptionsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, created_at')
          .eq('role', 'teacher')
          .order('created_at', { ascending: false }),

        supabase
          .from('subscriptions')
          .select('user_id, status, paid_until, payment_note')
      ])

      if (teachersResult.error) throw teachersResult.error
      if (subscriptionsResult.error) throw subscriptionsResult.error

      setTeachers((teachersResult.data ?? []) as Teacher[])
      setSubscriptions(
        (subscriptionsResult.data ?? []) as Subscription[]
      )
    } catch (err) {
      console.error('[Admin abonnements]', err)
      setError(
        'Impossible de charger les enseignants et leurs abonnements. Vérifie les autorisations Supabase puis réessaie.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && profile?.role === 'admin') {
      void loadData()
    } else {
      setLoading(false)
    }
  }, [user, profile?.role, loadData])

  if (!user) {
    return <Navigate to="/connexion" replace />
  }

  if (profile?.role !== 'admin') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-primary-50 p-4">
        <section className="max-w-md rounded-xl border bg-white p-6 text-center">
          <h1 className="text-xl font-bold text-primary-800">
            Accès réservé
          </h1>
          <p className="mt-2 text-sm text-primary-600">
            Cette page est réservée à l’administration de PROFNOTE.
          </p>
        </section>
      </main>
    )
  }

  function getSubscription(teacherId: string) {
    return subscriptions.find(
      (subscription) => subscription.user_id === teacherId
    )
  }

  function getStatusLabel(subscription?: Subscription) {
    if (!subscription) return 'Aucun abonnement enregistré'

    if (
      subscription.status === 'active' &&
      subscription.paid_until &&
      new Date(subscription.paid_until).getTime() > Date.now()
    ) {
      return 'Abonnement actif'
    }

    if (
      subscription.status === 'trial' &&
      subscription.paid_until &&
      new Date(subscription.paid_until).getTime() > Date.now()
    ) {
      return 'Essai gratuit'
    }

    return 'Accès expiré'
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return 'Non définie'

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Non définie'

    return date.toLocaleDateString('fr-FR')
  }

  async function updateSubscription(
    teacher: Teacher,
    action: 'activate' | 'block'
  ) {
    if (!user) return

    const message =
      action === 'activate'
        ? `Activer l'abonnement de ${teacher.full_name || teacher.email || 'cet enseignant'} pour 10 mois ?`
        : `Suspendre l'accès de ${teacher.full_name || teacher.email || 'cet enseignant'} ?`

    if (!window.confirm(message)) return

    setBusyId(teacher.id)
    setError('')
    setSuccess('')

    try {
      const now = new Date()
      let paidUntil = new Date(now)

      if (action === 'activate') {
        // Ajouter 10 mois calendaires sans dépasser le dernier jour du mois cible.
        const originalDay = paidUntil.getDate()

        paidUntil.setDate(1)
        paidUntil.setMonth(paidUntil.getMonth() + 10)

        const lastDayOfTargetMonth = new Date(
          paidUntil.getFullYear(),
          paidUntil.getMonth() + 1,
          0
        ).getDate()

        paidUntil.setDate(
          Math.min(originalDay, lastDayOfTargetMonth)
        )
      }

      const payload = {
        user_id: teacher.id,
        status: action === 'activate' ? 'active' : 'expired',
        paid_until: paidUntil.toISOString(),
        activated_at: action === 'activate' ? now.toISOString() : null,
        activated_by: action === 'activate' ? user.id : null,
        payment_note:
          action === 'activate'
            ? 'Activation manuelle par l’administration'
            : 'Suspension manuelle par l’administration',
        updated_at: now.toISOString()
      }

      const { error: updateError } = await supabase
        .from('subscriptions')
        .upsert(payload, { onConflict: 'user_id' })

      if (updateError) throw updateError

      setSuccess(
        action === 'activate'
          ? `Abonnement activé pour ${teacher.full_name || teacher.email || 'cet enseignant'}.`
          : `Accès suspendu pour ${teacher.full_name || teacher.email || 'cet enseignant'}.`
      )

      await loadData()
    } catch (err) {
      console.error('[Admin abonnements] Mise à jour impossible :', err)
      setError(
        "L'opération a échoué. Vérifie les politiques d'accès Supabase et réessaie."
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="min-h-screen bg-primary-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary-500">
              PROFNOTE · ADMINISTRATION
            </p>
            <h1 className="mt-2 text-2xl font-bold text-primary-800">
              Gestion des abonnements
            </h1>
            <p className="mt-2 text-sm text-primary-600">
              Les actions sur les abonnements ne suppriment pas les données scolaires.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm font-medium text-primary-700 disabled:opacity-50"
          >
            {loading ? 'Chargement…' : 'Actualiser'}
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          >
            {success}
          </div>
        )}

        <section className="mb-5 rounded-xl border border-primary-100 bg-white p-4">
          <p className="text-sm text-primary-600">
            Nombre d'enseignants :
            <strong className="ml-2 text-primary-800">
              {teachers.length}
            </strong>
          </p>
        </section>

        {loading ? (
          <div className="rounded-xl bg-white p-8 text-center text-primary-600">
            Chargement des abonnements…
          </div>
        ) : teachers.length === 0 ? (
          <div className="rounded-xl border border-primary-100 bg-white p-8 text-center text-primary-600">
            Aucun enseignant trouvé.
          </div>
        ) : (
          <div className="space-y-4">
            {teachers.map((teacher) => {
              const subscription = getSubscription(teacher.id)
              const status = getStatusLabel(subscription)
              const isBusy = busyId === teacher.id
              const isActive = status === 'Abonnement actif'

              return (
                <article
                  key={teacher.id}
                  className="rounded-xl border border-primary-100 bg-white p-4 shadow-sm md:p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <h2 className="break-words font-semibold text-primary-800">
                        {teacher.full_name || 'Nom non renseigné'}
                      </h2>

                      <p className="mt-1 break-all text-sm text-primary-600">
                        {teacher.email || 'Email non renseigné'}
                      </p>

                      <p className="mt-2 text-xs text-primary-500">
                        Inscription : {formatDate(teacher.created_at)}
                      </p>

                      <p className="mt-1 text-sm text-primary-700">
                        Statut : <strong>{status}</strong>
                      </p>

                      <p className="mt-1 text-sm text-primary-600">
                        Fin d'accès : {formatDate(subscription?.paid_until)}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void updateSubscription(teacher, 'activate')
                        }
                        className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBusy
                          ? 'Traitement…'
                          : isActive
                            ? 'Renouveler 10 mois'
                            : 'Activer 10 mois'}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy || status === 'Accès expiré'}
                        onClick={() =>
                          void updateSubscription(teacher, 'block')
                        }
                        className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Suspendre l'accès
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <p className="mt-6 text-xs text-primary-500">
          La réactivation est manuelle. Vérifie le paiement avant de renouveler un abonnement.
        </p>
      </div>
    </main>
  )
}
