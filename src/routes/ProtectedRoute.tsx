import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  canUseOfflineAccess,
  isAuthError,
  saveAccessSnapshot
} from '@/lib/offlineAccess'

interface AccessCheck {
  userId: string | null
  loading: boolean
  allowed: boolean
  /**
   * Vérification impossible (réseau, serveur, jeton) et aucun accès déjà vérifié sur
   * l'appareil. L'enseignant n'est PAS déclaré sans abonnement : on ne l'envoie jamais
   * vers la page d'abonnement dans ce cas, on lui demande seulement de réessayer.
   */
  unverified?: boolean
}

export default function ProtectedRoute() {
  const { session, signOut } = useAuth()
  const userId = session?.user?.id ?? null

  const [check, setCheck] = useState<AccessCheck>({
    userId: null,
    loading: true,
    allowed: false
  })
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    // Vérification qui n'a pas pu aboutir : on garde l'accès déjà accordé (même session),
    // sinon on s'appuie sur la dernière vérification faite en ligne sur cet appareil,
    // sinon on demande de réessayer. Jamais de renvoi vers la page d'abonnement.
    function applyFailedCheck() {
      setCheck((previous) => {
        if (previous.userId === userId && previous.allowed) return previous

        const allowed = canUseOfflineAccess(userId!)
        return { userId, loading: false, allowed, unverified: !allowed }
      })
    }

    async function verifyAccess() {
      // Sans internet : on s'appuie sur la dernière vérification faite en ligne
      // (abonnement non échu, moins de 30 jours, horloge cohérente).
      if (!navigator.onLine) {
        applyFailedCheck()
        return
      }

      // Première vérification : écran d'attente. Revérification en cours d'utilisation
      // (retour du réseau) : on laisse la page affichée pour ne perdre aucune saisie.
      setCheck((previous) =>
        previous.userId === userId && previous.allowed
          ? previous
          : { userId, loading: true, allowed: false }
      )

      const fetchAccess = () =>
        Promise.all([
          supabase
            .from('profiles')
            .select('role')
            .eq('id', userId!)
            .maybeSingle(),

          supabase
            .from('subscriptions')
            .select('status, paid_until')
            .eq('user_id', userId!)
            .maybeSingle()
        ])

      try {
        let [profileResult, subscriptionResult] = await fetchAccess()

        // Jeton de connexion expiré (401) : on le renouvelle puis on réessaie une fois.
        if (
          isAuthError(profileResult.error) ||
          isAuthError(subscriptionResult.error)
        ) {
          const { error: refreshError } = await supabase.auth.refreshSession()
          if (!refreshError) {
            ;[profileResult, subscriptionResult] = await fetchAccess()
          }
        }

        if (cancelled) return

        if (profileResult.error || subscriptionResult.error) {
          const requestError = profileResult.error ?? subscriptionResult.error

          console.error(
            '[Abonnement] Impossible de vérifier les droits d’accès.',
            requestError
          )

          // Échec de vérification (réseau, jeton, serveur) : si l'abonnement a déjà été
          // vérifié sur cet appareil et n'est pas échu, on laisse l'enseignant travailler.
          // Il ne peut pas lire de données sans droit : les règles de la base s'appliquent.
          applyFailedCheck()
          return
        }

        const isAdmin = profileResult.data?.role === 'admin'
        const subscription = subscriptionResult.data

        const endDate = subscription?.paid_until
          ? new Date(subscription.paid_until).getTime()
          : 0

        const dateIsValid =
          Number.isFinite(endDate) && endDate > Date.now()

        const subscriptionIsValid =
          (subscription?.status === 'trial' ||
            subscription?.status === 'active') &&
          dateIsValid

        const allowed = isAdmin || subscriptionIsValid

        // Trace de cette vérification réussie, utilisée si le réseau disparaît ensuite.
        saveAccessSnapshot(userId!, {
          allowed,
          isAdmin,
          paidUntil: subscription?.paid_until ?? null
        })

        setCheck({
          userId,
          loading: false,
          allowed
        })
      } catch (error) {
        console.error('[Abonnement] Erreur de vérification :', error)

        if (!cancelled) {
          applyFailedCheck()
        }
      }
    }

    void verifyAccess()

    // Quand le réseau revient, on revérifie l'abonnement pour de bon.
    const onBackOnline = () => {
      void verifyAccess()
    }
    window.addEventListener('online', onBackOnline)

    return () => {
      cancelled = true
      window.removeEventListener('online', onBackOnline)
    }
  }, [userId, retryCount])

  if (!session) {
    return <Navigate to="/connexion" replace />
  }

  if (check.userId !== userId || check.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-primary-600">
        Vérification de votre abonnement…
      </div>
    )
  }

  if (check.unverified) {
    return (
      <main className="min-h-screen bg-primary-50 flex items-center justify-center p-4">
        <section className="bg-white w-full max-w-lg rounded-2xl border border-primary-100 shadow-sm p-6 md:p-8">
          <p className="text-sm font-semibold text-primary-500">PROFNOTE</p>

          <h1 className="text-2xl font-bold text-primary-800 mt-3">
            Connexion internet nécessaire
          </h1>

          <p className="text-sm text-primary-500 mt-2">
            Votre compte et vos données scolaires sont conservés. PROFNOTE n’a pas
            pu joindre le serveur : activez vos données mobiles ou le Wi-Fi.
            L’application s’ouvrira automatiquement dès que la connexion reviendra.
          </p>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => {
                setCheck({ userId, loading: true, allowed: false })
                setRetryCount((count) => count + 1)
              }}
              className="w-full rounded-lg bg-primary-600 text-white px-4 py-3 font-medium hover:bg-primary-700"
            >
              Réessayer
            </button>

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

  if (!check.allowed) {
    return <Navigate to="/abonnement" replace />
  }

  return <Outlet />
}
