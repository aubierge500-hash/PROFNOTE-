
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'
import PaymentInstructions from '@/components/PaymentInstructions'

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
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      setSubscription(null)
      return
    }

    let cancelled = false

    async function loadSubscription() {
      setLoading(true)
      setError('')

      try {
        const { data, error: queryError } = await supabase
          .from('subscriptions')
          .select('status, paid_until')
          .eq('user_id', user!.id)
          .maybeSingle()

        if (cancelled) return

        if (queryError) {
          console.error(
            '[PROFNOTE] Erreur de vérification de l’abonnement :',
            queryError
          )

          setError(
            'Impossible de vérifier votre abonnement. Vérifiez votre connexion puis réessayez.'
          )
          setSubscription(null)
          return
        }

        setSubscription(data as Subscription | null)
      } catch (err) {
        console.error(
          '[PROFNOTE] Erreur inattendue :',
          err
        )

        if (!cancelled) {
          setError(
            'Une erreur est survenue pendant la vérification. Veuillez réessayer.'
          )
          setSubscription(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadSubscription()

    return () => {
      cancelled = true
    }
  }, [user?.id, retryCount])

  if (!user) {
    return <Navigate to="/connexion" replace />
  }

  const paidUntilTime = subscription?.paid_until
    ? new Date(subscription.paid_until).getTime()
    : NaN

  const subscriptionIsValid =
    (subscription?.status === 'active' ||
      subscription?.status === 'trial') &&
    Number.isFinite(paidUntilTime) &&
    paidUntilTime > Date.now()

  // Si l’abonnement est valide, rétablir directement l’accès.
  if (!loading && !error && subscriptionIsValid) {
    return <Navigate to="/" replace />
  }

  const expiration = subscription?.paid_until
    ? new Date(subscription.paid_until)
    : null

  const expirationLabel =
    expiration && !Number.isNaN(expiration.getTime())
      ? expiration.toLocaleDateString('fr-FR')
      : null

  const statusLabel =
    subscription?.status === 'active'
      ? 'Abonnement activé'
      : subscription?.status === 'trial'
        ? 'Essai gratuit'
        : subscription?.status === 'expired'
          ? 'Abonnement expiré'
          : 'Aucun abonnement actif'

  return (
    <main className="min-h-screen bg-primary-50 flex items-center justify-center p-4">
      <section className="bg-white w-full max-w-lg rounded-2xl border border-primary-100 shadow-sm p-6 md:p-8">
        <p className="text-sm font-semibold text-primary-500">
          PROFNOTE
        </p>

        <h1 className="text-2xl font-bold text-primary-800 mt-3">
          Vérification de votre abonnement
        </h1>

        <p className="text-sm text-primary-500 mt-2">
          Votre compte et vos données scolaires sont conservés.
          Cette page vérifie vos droits d’accès.
        </p>

        {loading && (
          <div
            role="status"
            className="mt-5 rounded-lg bg-primary-50 p-4 text-sm text-primary-700"
          >
            Vérification de votre abonnement en cours…
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="mt-5 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="mt-5 rounded-lg bg-primary-50 p-4 space-y-3">
            <p className="text-sm text-primary-600 break-all">
              Compte : <strong>{user.email}</strong>
            </p>

            <p className="text-sm text-primary-600">
              Statut : <strong>{statusLabel}</strong>
            </p>

            <p className="text-sm text-primary-600">
              Fin d’accès :{' '}
              <strong>
                {expirationLabel ?? 'Non définie'}
              </strong>
            </p>

            {subscriptionIsValid ? (
              <p className="text-sm text-green-700">
                Abonnement valide. Ouverture de votre espace…
              </p>
            ) : (
              <p className="text-sm text-red-700">
                Votre accès n’est pas actif. Si vous venez de
                payer ou si l’administrateur vient d’activer
                votre abonnement, relancez la vérification.
              </p>
            )}
          </div>
        )}

        {!subscriptionIsValid && !loading && !error && (
          <div className="mt-6 border-t border-primary-100 pt-6">
            <h2 className="mb-4 text-lg font-bold text-primary-800">Réactiver mon accès</h2>
            <PaymentInstructions />
          </div>
        )}

        <div className="mt-6 space-y-3">
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              setRetryCount((count) => count + 1)
            }
            className="w-full rounded-lg bg-primary-600 text-white px-4 py-3 font-medium hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? 'Vérification en cours…'
              : 'Vérifier à nouveau mon abonnement'}
          </button>

          {!subscriptionIsValid && !loading && !error && (
            <a
              href={`mailto:aubiergeservices@gmail.com?subject=${encodeURIComponent('Abonnement PROFNOTE')}&body=${encodeURIComponent(`Bonjour,\n\nJe souhaite vérifier mon abonnement PROFNOTE.\nCompte : ${user.email}\nStatut affiché : ${statusLabel}\n\nMerci.`)}`}
              className="block text-center rounded-lg border border-primary-200 px-4 py-3 text-sm font-medium text-primary-700 hover:bg-primary-50"
            >
              Contacter l’administration
            </a>
          )}

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
