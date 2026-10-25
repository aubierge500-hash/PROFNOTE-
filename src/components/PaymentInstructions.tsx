import { useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import {
  PAYMENT_NUMBERS,
  SUBSCRIPTION_PRICE_FCFA,
  buildPaymentProofUrl,
  formatFcfa
} from '@/lib/payment'

/** Mode d'emploi du paiement : montant, numéros par opérateur, étapes, bouton « J'ai payé ». */
export default function PaymentInstructions() {
  const { user, profile } = useAuth()
  const [copied, setCopied] = useState<string | null>(null)

  async function copyNumber(digits: string) {
    try {
      await navigator.clipboard.writeText(digits)
      setCopied(digits)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      window.prompt('Copiez ce numéro :', digits)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-primary-50 p-4 text-center">
        <p className="text-sm text-primary-600">Montant à déposer</p>
        <p className="mt-1 text-3xl font-bold text-primary-800">{formatFcfa(SUBSCRIPTION_PRICE_FCFA)}</p>
        <p className="mt-1 text-xs text-primary-500">Abonnement valable 10 mois</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-primary-700">Choisissez le numéro de votre réseau</p>
        {PAYMENT_NUMBERS.map((n) => (
          <div key={n.digits} className="flex items-center justify-between gap-3 rounded-xl border border-primary-100 p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-primary-500">{n.operator}</p>
              <p className="text-lg font-bold tracking-wide text-primary-800 select-all">{n.display}</p>
            </div>
            <button
              type="button"
              onClick={() => void copyNumber(n.digits)}
              className="btn-secondary flex shrink-0 items-center gap-2 px-3 py-2 text-sm"
            >
              {copied === n.digits ? <Check size={16} /> : <Copy size={16} />}
              {copied === n.digits ? 'Copié' : 'Copier'}
            </button>
          </div>
        ))}
      </div>

      <ol className="space-y-3">
        {[
          `Faites un dépôt de ${formatFcfa(SUBSCRIPTION_PRICE_FCFA)} sur le numéro de votre réseau.`,
          'Gardez le message de confirmation que vous recevez, ou faites-en une capture d’écran.',
          'Touchez « J’ai payé » ci-dessous et envoyez la capture sur WhatsApp.'
        ].map((text, index) => (
          <li key={text} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white">
              {index + 1}
            </span>
            <span className="text-sm text-primary-700">{text}</span>
          </li>
        ))}
      </ol>

      <a
        href={buildPaymentProofUrl(profile?.full_name, user?.email ?? profile?.email)}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary flex w-full items-center justify-center gap-2"
      >
        <MessageCircle size={18} /> J’ai payé
      </a>

      <p className="text-center text-xs text-primary-500">
        Votre accès est activé dès que le paiement est vérifié. Vos données scolaires sont conservées.
      </p>
    </div>
  )
}
