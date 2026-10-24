import { supabase } from './supabase'

/** Règles du parrainage (le calcul réel est fait côté base de données). */
export const REFERRAL_BLOCK_SIZE = 5
export const REFERRAL_REWARD_FCFA = 100
export const REFERRAL_MIN_WITHDRAWAL_FCFA = 500

export interface ReferralStats {
  code: string
  signedUp: number
  qualified: number
  earned: number
  withdrawn: number
  available: number
  pendingRequest: boolean
}

export interface ReferralWithdrawal {
  id: string
  user_id: string
  amount: number
  phone: string
  status: 'pending' | 'paid' | 'rejected'
  created_at: string
  processed_at: string | null
  note: string | null
}

/** Nettoie un code saisi à la main (espaces, minuscules). */
export function normalizeReferralCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12)
}

export function buildReferralLink(code: string): string {
  return `${window.location.origin}/inscription?ref=${encodeURIComponent(code)}`
}

export function buildWhatsAppShareUrl(code: string): string {
  const text =
    `Bonjour ! J'utilise PROFNOTE pour gérer mes notes et mes bulletins, et ça me fait gagner beaucoup de temps. ` +
    `Inscris-toi avec mon lien : ${buildReferralLink(code)} (code de parrainage : ${code})`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/** Messages d'erreur de la base, nettoyés pour l'affichage. */
function readableError(message: string | undefined, fallback: string): string {
  if (!message) return fallback
  if (/Solde insuffisant|Numéro Mobile Money|demande de retrait|Non connecté/i.test(message)) return message
  return fallback
}

export async function fetchReferralStats(): Promise<{ data: ReferralStats | null; error: string | null }> {
  const { data, error } = await supabase.rpc('profnote_my_referral_stats')
  if (error) {
    console.error('[Parrainage] Lecture des statistiques :', error)
    return { data: null, error: 'Impossible de charger votre parrainage. Vérifiez votre connexion puis réessayez.' }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { data: null, error: 'Aucune donnée de parrainage trouvée.' }

  return {
    data: {
      code: String(row.ref_code ?? ''),
      signedUp: Number(row.nb_signed_up ?? 0),
      qualified: Number(row.nb_qualified ?? 0),
      earned: Number(row.earned_fcfa ?? 0),
      withdrawn: Number(row.withdrawn_fcfa ?? 0),
      available: Number(row.available_fcfa ?? 0),
      pendingRequest: Boolean(row.pending_request)
    },
    error: null
  }
}

export async function fetchMyWithdrawals(): Promise<ReferralWithdrawal[]> {
  const { data, error } = await supabase
    .from('referral_withdrawals')
    .select('id, user_id, amount, phone, status, created_at, processed_at, note')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[Parrainage] Lecture des retraits :', error)
    return []
  }
  return (data ?? []) as ReferralWithdrawal[]
}

export async function requestWithdrawal(
  phone: string
): Promise<{ amount: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('profnote_request_withdrawal', { p_phone: phone })
  if (error) {
    console.error('[Parrainage] Demande de retrait :', error)
    return { amount: null, error: readableError(error.message, 'La demande a échoué. Réessayez dans un instant.') }
  }
  return { amount: Number(data), error: null }
}
