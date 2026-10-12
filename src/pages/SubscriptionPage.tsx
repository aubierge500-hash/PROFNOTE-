
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'

interface Subscription {
  status: string
  paid_until: string | null
}

export default function SubscriptionPage() {
  const { user, signOut } = useAuth()

  const [subscription, setSubscription] =
    useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return

    let cancelled = false

    async function loadSubscription() {
      setLoading(true)
      setError('')

      const { data, error: queryError } = await supabase
        .from('subscriptions')
        .select('status, paid_until')
        .eq('user_id', user!.id)
        .maybeSingle()

      if (cancelled) return

      if (queryError) {
        setError(
          'Impossible de vérifier votre abonnement. Veuillez réessayer.'
        )
      } else {
        setSubscription(data as Subscription | null)
      }

      setLoading(false)
    }

    void loadSubscription()

    return () => {
      cancelled = true
    }
  }, [user])

  if (!user) {
    return <Navigate to="/connexion" replace />
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Vérification de votre abonnement…
      </div>
    )
  }

  const expiration = subscription?.paid_until
    ? new Date(subscription.paid_until).toLocaleDateString('fr-FR')
    : null

  return (
    <main className="min-h-screen bg-primary-50 flex items-center justify-center p-4">
      <section className="bg-white w-full max-w-lg rounded-2xl border border-primary-100 shadow-sm p-6 md:p-8">
        <p className="text-sm font-semibold text-primary-500">
          PROFNOTE
        </p>

        <h1 className="text-2xl font-bold text-primary-800 mt-3">
          Votre abonnement
        </h1>

        <p className="text-sm text-primary-500 mt-2">
          Votre compte et vos données scolaires sont conservés.
          L’accès aux fonctionnalités sera rétabli après validation
          de votre abonnement.
        </p>

        {error && (
          <div className="mt-5 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!error && (
          <div className="mt-5 rounded-lg bg-primary-50 p-4 space-y-2">
            <p className="text-sm text-primary-600">
              Compte : <strong>{user.email}</strong>
            </p>

            <p className="text-sm text-primary-600">
              Statut :{' '}
              <strong>
                {subscription?.status === 'trial'
                  ? 'Essai gratuit'
                  : subscription?.status === 'active'
                    ? 'Abonnement'
                    : 'À vérifier'}
              </strong>
            </p>

            {expiration && (
              <p className="text-sm text-primary-600">
                Date de fin enregistrée : <strong>{expiration}</strong>
              </p>
            )}
          </div>
        )}

        <div className="mt-6 space-y-3">
          <h2 className="font-semibold text-primary-800">
            Comment rétablir votre accès ?
          </h2>

          <p className="text-sm text-primary-600">
            Contactez l’administration de PROFNOTE pour connaître
            les modalités de paiement. Après vérification du
            paiement, votre abonnement sera activé.
          </p>

          <a
            href={`mailto:aubiergeservices@gmail.com?subject=${encodeURIComponent('Abonnement PROFNOTE')}&body=${encodeURIComponent(`Bonjour,\n\nJe souhaite activer mon abonnement PROFNOTE.\nCompte : ${user.email}\n\nMerci.`)}`}
            className="block text-center rounded-lg bg-primary-600 text-white px-4 py-3 font-medium hover:bg-primary-700"
          >
            Contacter l’administration
          </a>

          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full rounded-lg border border-primary-200 px-4 py-3 text-sm text-primary-700 hover:bg-primary-50"
          >
            Déconnexion
          </button>
        </div>
      </section>
    </main>
  )
}
