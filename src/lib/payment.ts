/** Informations de paiement de l'abonnement PROFNOTE (dépôt Mobile Money). */
export const SUBSCRIPTION_PRICE_FCFA = 1125

export interface PaymentNumber {
  operator: string
  display: string
  digits: string
}

/** Numéros de dépôt, un par opérateur : l'enseignant choisit celui de son réseau. */
export const PAYMENT_NUMBERS: PaymentNumber[] = [
  { operator: 'MTN', display: '01 66 76 97 62', digits: '0166769762' },
  { operator: 'Moov', display: '01 64 67 30 98', digits: '0164673098' },
  { operator: 'Celtiis', display: '01 29 59 53 10', digits: '0129595310' }
]

/** Numéro WhatsApp qui reçoit les preuves de paiement (format international, sans « + »). */
export const PAYMENT_WHATSAPP_INTERNATIONAL = '2290129595310'

export function formatFcfa(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

/** Nombre de jours entiers restants (arrondi au supérieur), 0 si la date est passée ou invalide. */
export function daysLeft(paidUntil: string | null | undefined): number {
  if (!paidUntil) return 0
  const end = new Date(paidUntil).getTime()
  if (!Number.isFinite(end)) return 0
  const ms = end - Date.now()
  return ms > 0 ? Math.ceil(ms / (24 * 60 * 60 * 1000)) : 0
}

/** Lien WhatsApp avec un message de preuve de paiement déjà rempli. */
export function buildPaymentProofUrl(fullName: string | null | undefined, email: string | null | undefined): string {
  const lines = [
    `Bonjour, j'ai payé mon abonnement PROFNOTE (${formatFcfa(SUBSCRIPTION_PRICE_FCFA)}).`,
    `Nom : ${fullName?.trim() || 'à préciser'}`,
    `Email du compte : ${email?.trim() || 'à préciser'}`,
    `Je joins la capture du message de confirmation. Merci d'activer mon compte.`
  ]
  return `https://wa.me/${PAYMENT_WHATSAPP_INTERNATIONAL}?text=${encodeURIComponent(lines.join('\n'))}`
}
