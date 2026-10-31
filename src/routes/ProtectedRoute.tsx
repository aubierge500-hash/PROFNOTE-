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
}

export default function ProtectedRoute() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null

  const [check, setCheck] = useState<AccessCheck>({
    userId: null,
    loading: true,
    allowed: false
  })

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    async function verifyAccess() {
      // Sans internet : on s'appuie sur la dernière vérification faite en ligne
      // (abonnement non échu, moins de 30 jours, horloge cohérente).
      if (!navigator.onLine) {
        setCheck({
          userId,
          loading: false,
          allowed: canUseOfflineAccess(userId!)
        })
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
          const offlineAllowed = canUseOfflineAccess(userId!)

          setCheck({
            userId,
            loading: false,
            allowed: offlineAllowed
          })
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
          setCheck({
            userId,
            loading: false,
            allowed: canUseOfflineAccess(userId!)
          })
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
  }, [userId])

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

  if (!check.allowed) {
    return <Navigate to="/abonnement" replace />
  }

  return <Outlet />
}
