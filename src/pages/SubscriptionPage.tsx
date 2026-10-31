import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'
import PaymentInstructions from '@/components/PaymentInstructions'
import {
  canUseOfflineAccess,
  isNetworkFailure,
  saveAccessSnapshot
} from '@/lib/offlineAccess'

interface Subscription {
  status: string
  paid_until: string | null
}

type CheckProblem = 'network' | 'server' | null

/** Évite une attente infinie sur une connexion très lente. */
const CHECK_TIMEOUT_MS = 15000

function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error('timeout')),
      CHECK_TIMEOUT_MS
    )
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export default function SubscriptionPage() {
  const { user, signOut } = useAuth()

  const [subscription, setSubscription] =
    useState<Subscription | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState<CheckProblem>(null)
  const [offlineAllowed, setOfflineAllowed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  // Dès que le réseau revient, on relance la vérification toute seule.
  useEffect(() => {
    const onBackOnline = () => setRetryCount((count) => count + 1)
    window.addEventListener('online', onBackOnline)
    return () => window.removeEventListener('online', onBackOnline)
  }, [])

  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      setSubscription(null)
      return
    }

    const userId = user.id
    let cancelled = false

    async function loadSubscription() {
      setLoading(true)
      setProblem(null)

      // Pas d'internet : on s'appuie sur la dernière vérification faite en ligne.
      if (!navigator.onLine) {
        if (cancelled) return
        setSubscription(null)
        setOfflineAllowed(canUseOfflineAccess(userId))
        setProblem('network')
        setLoading(false)
        return
      }

      try {
        const [profileResult, subscriptionResult] = await withTimeout(
          Promise.all([
            supabase
              .from('profiles')
              .select('role')
              .eq('id', userId)
              .maybeSingle(),
            supabase
              .from('subscriptions')
              .select('status, paid_until')
              .eq('user_id', userId)
              .maybeSingle()
          ])
        )

        if (cancelled) return

        const queryError =
          profileResult.error ?? subscriptionResult.error

        if (queryError) {
          console.error(
            '[PROFNOTE] Erreur de vérification de l’abonnement :',
            queryError
          )

          setSubscription(null)
          setOfflineAllowed(
            isNetworkFailure(queryError.message) &&
              canUseOfflineAccess(userId)
          )
          setProblem(
            isNetworkFailure(queryError.message)
              ? 'network'
              : 'server'
          )
          return
        }

        const admin = profileResult.data?.role === 'admin'
        const data = subscriptionResult.data as Subscription | null

        const end = data?.paid_until
          ? new Date(data.paid_until).getTime()
          : 0
        const valid =
          (data?.status === 'active' || data?.status === 'trial') &&
          Number.isFinite(end) &&
          end > Date.now()

        // Mémorise ce résultat : l'accès hors ligne sera correct juste après.
        saveAccessSnapshot(userId, {
          allowed: admin || valid,
          isAdmin: admin,
          paidUntil: data?.paid_until ?? null
        })

        setIsAdmin(admin)
        setSubscription(data)
        setOfflineAllowed(false)
      } catch (err) {
        console.error('[PROFNOTE] Erreur inattendue :', err)

        if (!cancelled) {
          setSubscription(null)
          setOfflineAllowed(
            isNetworkFailure(err) && canUseOfflineAccess(userId)
          )
          setProblem(isNetworkFailure(err) ? 'network' : 'server')
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
    isAdmin ||
    ((subscription?.status === 'active' ||
      subscription?.status === 'trial') &&
      Number.isFinite(paidUntilTime) &&
      paidUntilTime > Date.now())

  // Abonnement valide : on rétablit directement l'accès.
  if (!loading && !problem && subscriptionIsValid) {
    return <Navigate to="/" replace />
  }

  // Réseau coupé mais abonnement déjà vérifié sur cet appareil : on laisse travailler.
  if (!loading && problem === 'network' && offlineAllowed) {
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

  const showResult = !loading && !problem

  return (
    <main className="min-h-screen bg-primary-50 flex items-center justify-center p-4">
      <section className="bg-white w-full max-w-lg rounded-2xl border border-primary-100 shadow-sm p-6 md:p-8">
        <p className="text-sm font-semibold text-primary-500">
          PROFNOTE
        </p>

        <h1 className="text-2xl font-bold text-primary-800 mt-3">
          {problem === 'network'
            ? 'Connexion internet nécessaire'
            : 'Vérification de votre abonnement'}
        </h1>

        <p className="text-sm text-primary-500 mt-2">
          Votre compte et vos données scolaires sont conservés.
          {problem === 'network'
            ? ' Votre abonnement n’est pas en cause.'
            : ' Cette page vérifie vos droits d’accès.'}
        </p>

        {loading && (
          <div
            role="status"
            className="mt-5 rounded-lg bg-primary-50 p-4 text-sm text-primary-700"
          >
            Vérification de votre abonnement en cours…
          </div>
        )}

        {!loading && problem === 'network' && (
          <div
            role="status"
            className="mt-5 rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 space-y-2"
          >
            <p>
              Impossible de joindre le serveur : votre connexion
              est coupée ou trop faible.
            </p>
            <p>
              Activez vos données mobiles ou le Wi-Fi. La
              vérification se relancera automatiquement dès que
              internet reviendra, puis vous pourrez travailler
              même sans connexion.
            </p>
          </div>
        )}

        {!loading && problem === 'server' && (
          <div
            role="alert"
            className="mt-5 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700"
          >
            Le service ne répond pas correctement pour le moment.
            Ce n’est pas un problème de votre abonnement. Réessayez
            dans quelques instants.
          </div>
        )}

        {showResult && (
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

        {!subscriptionIsValid && showResult && (
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
              : problem
                ? 'Réessayer'
                : 'Vérifier à nouveau mon abonnement'}
          </button>

          {!subscriptionIsValid && showResult && (
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
