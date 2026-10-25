import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'
import { daysLeft } from '@/lib/payment'

interface SubscriptionRow {
  status: string
  paid_until: string | null
}

/** Rappel affiché pendant l'essai gratuit, ou quelques jours avant la fin d'un abonnement. */
export default function TrialBanner() {
  const { user, profile } = useAuth()
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    async function load() {
      try {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('status, paid_until')
          .eq('user_id', user!.id)
          .maybeSingle()
        if (!cancelled && !error) setSubscription(data as SubscriptionRow | null)
      } catch {
        // Le bandeau est facultatif : en cas d'erreur (hors ligne, etc.), on n'affiche rien.
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  if (!subscription || profile?.role === 'admin') return null

  const days = daysLeft(subscription.paid_until)
  if (days <= 0) return null

  const isTrial = subscription.status === 'trial'
  const endingSoon = subscription.status === 'active' && days <= 15
  if (!isTrial && !endingSoon) return null

  const plural = days > 1 ? 's' : ''
  const message = isTrial
    ? `Essai gratuit : il vous reste ${days} jour${plural}.`
    : `Votre abonnement se termine dans ${days} jour${plural}.`
  const urgent = days <= 2

  return (
    <div
      role="status"
      className={`flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        urgent ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <Clock size={16} className="shrink-0" /> {message}
      </p>
      <Link to="/paiement" className="btn-primary text-center text-sm">
        Payer mon abonnement
      </Link>
    </div>
  )
}
