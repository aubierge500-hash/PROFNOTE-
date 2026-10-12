
import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'

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
      setCheck({
        userId,
        loading: true,
        allowed: false
      })

      try {
        const [profileResult, subscriptionResult] = await Promise.all([
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

        if (cancelled) return

        if (profileResult.error || subscriptionResult.error) {
          console.error(
            '[Abonnement] Impossible de vérifier les droits d’accès.',
            profileResult.error ?? subscriptionResult.error
          )

          setCheck({
            userId,
            loading: false,
            allowed: false
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

        setCheck({
          userId,
          loading: false,
          allowed: isAdmin || subscriptionIsValid
        })
      } catch (error) {
        console.error('[Abonnement] Erreur de vérification :', error)

        if (!cancelled) {
          setCheck({
            userId,
            loading: false,
            allowed: false
          })
        }
      }
    }

    void verifyAccess()

    return () => {
      cancelled = true
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
