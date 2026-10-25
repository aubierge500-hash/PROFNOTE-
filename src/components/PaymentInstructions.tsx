import { useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import {
  PAYMENT_NUMBER_DIGITS,
  PAYMENT_NUMBER_DISPLAY,
  SUBSCRIPTION_PRICE_FCFA,
  buildPaymentProofUrl,
  formatFcfa
} from '@/lib/payment'

/** Mode d'emploi du paiement : montant, numéro à copier, étapes, bouton « J'ai payé ». */
export default function PaymentInstructions() {
  const { user, profile } = useAuth()
  const [copied, setCopied] = useState(false)

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(PAYMENT_NUMBER_DIGITS)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copiez ce numéro :', PAYMENT_NUMBER_DIGITS)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-primary-50 p-4 text-center">
        <p className="text-sm text-primary-600">Montant à déposer</p>
        <p className="mt-1 text-3xl font-bold text-primary-800">{formatFcfa(SUBSCRIPTION_PRICE_FCFA)}</p>
        <p className="mt-1 text-xs text-primary-500">Abonnement valable 10 mois</p>
      </div>

      <div className="rounded-xl border border-primary-100 p-4">
        <p className="text-sm text-primary-600">Numéro de dépôt (Mobile Money)</p>
        <p className="mt-1 text-2xl font-bold tracking-wide text-primary-800 select-all">{PAYMENT_NUMBER_DISPLAY}</p>
        <button type="button" onClick={() => void copyNumber()} className="btn-secondary mt-3 flex w-full items-center justify-center gap-2">
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? 'Numéro copié' : 'Copier le numéro'}
        </button>
      </div>

      <ol className="space-y-3">
        {[
          `Faites un dépôt de ${formatFcfa(SUBSCRIPTION_PRICE_FCFA)} sur le numéro ci-dessus.`,
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
