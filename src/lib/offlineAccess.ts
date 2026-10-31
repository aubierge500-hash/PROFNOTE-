/**
 * Droit d'accès hors ligne.
 *
 * Quand l'abonnement a été vérifié en ligne, on en garde une trace sur l'appareil.
 * Sans internet, l'enseignant peut continuer tant que :
 *  - son abonnement (ou essai) n'est pas arrivé à échéance,
 *  - la dernière vérification en ligne date de moins de MAX_OFFLINE_DAYS jours,
 *  - l'horloge du téléphone n'a pas été reculée.
 * Au retour du réseau, la vérification normale reprend automatiquement.
 */

import type { Session } from '@supabase/supabase-js'

const ACCESS_KEY = 'profnote:access-snapshot:v1'

/** Durée maximale d'utilisation hors ligne depuis la dernière vérification en ligne. */
export const MAX_OFFLINE_DAYS = 30

const MAX_OFFLINE_MS = MAX_OFFLINE_DAYS * 24 * 60 * 60 * 1000
/** Tolérance sur l'horloge avant de considérer qu'elle a été reculée. */
const CLOCK_TOLERANCE_MS = 10 * 60 * 1000

interface AccessSnapshot {
  userId: string
  allowed: boolean
  isAdmin: boolean
  paidUntil: string | null
  verifiedAt: number
  lastSeenAt: number
}

function readSnapshot(): AccessSnapshot | null {
  try {
    const raw = localStorage.getItem(ACCESS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AccessSnapshot
    return parsed && typeof parsed.userId === 'string' ? parsed : null
  } catch {
    return null
  }
}

function writeSnapshot(snapshot: AccessSnapshot): void {
  try {
    localStorage.setItem(ACCESS_KEY, JSON.stringify(snapshot))
  } catch {
    // Stockage indisponible : l'accès hors ligne sera simplement refusé.
  }
}

/** À appeler après chaque vérification d'abonnement réussie EN LIGNE. */
export function saveAccessSnapshot(
  userId: string,
  data: { allowed: boolean; isAdmin: boolean; paidUntil: string | null }
): void {
  const now = Date.now()
  writeSnapshot({
    userId,
    allowed: data.allowed,
    isAdmin: data.isAdmin,
    paidUntil: data.paidUntil,
    verifiedAt: now,
    lastSeenAt: now
  })
}

/** Indique si l'utilisateur peut utiliser l'application sans réseau. */
export function canUseOfflineAccess(userId: string): boolean {
  const snapshot = readSnapshot()
  if (!snapshot || snapshot.userId !== userId || !snapshot.allowed) return false

  const now = Date.now()

  // Horloge reculée pour prolonger l'abonnement.
  if (now < snapshot.lastSeenAt - CLOCK_TOLERANCE_MS) return false

  // Trop longtemps sans vérification en ligne.
  if (now - snapshot.verifiedAt > MAX_OFFLINE_MS) return false

  if (!snapshot.isAdmin) {
    const end = snapshot.paidUntil ? new Date(snapshot.paidUntil).getTime() : 0
    if (!Number.isFinite(end) || end <= now) return false
  }

  writeSnapshot({ ...snapshot, lastSeenAt: Math.max(snapshot.lastSeenAt, now) })
  return true
}

export function clearAccessSnapshot(): void {
  try {
    localStorage.removeItem(ACCESS_KEY)
  } catch {
    // Rien à faire.
  }
}

/**
 * Lit la session Supabase enregistrée sur l'appareil (clé « sb-…-auth-token »), sans réseau.
 * Sert à garder l'enseignant connecté quand le jeton a expiré mais qu'il n'y a pas internet
 * pour le renouveler : le renouvellement se fera tout seul au retour du réseau.
 */
export function readStoredSession(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue

      const raw = localStorage.getItem(key)
      if (!raw) continue

      const parsed = JSON.parse(raw) as Partial<Session> & { currentSession?: Session }
      const candidate = (parsed.currentSession ?? parsed) as Partial<Session>

      if (candidate.user?.id && candidate.access_token && candidate.refresh_token) {
        return candidate as Session
      }
    }
  } catch {
    // Contenu illisible : on considère qu'il n'y a pas de session locale.
  }
  return null
}

/**
 * Reconnaît un jeton de connexion expiré ou refusé (réponse 401 de Supabase).
 * Cas typique : session reprise depuis l'appareil après une longue absence de réseau.
 */
export function isAuthError(error: unknown): boolean {
  const e = error as { message?: string; code?: string; status?: number } | null | undefined
  if (!e) return false
  return (
    e.status === 401 ||
    e.code === 'PGRST301' ||
    /jwt|invalid token|token is expired/i.test(e.message ?? '')
  )
}

/** Reconnaît une erreur due à l'absence ou à la lenteur du réseau. */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true

  const message =
    typeof error === 'string'
      ? error
      : (error as { message?: string } | null | undefined)?.message ?? ''

  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|aborted|timeout/i.test(
    message
  )
}
