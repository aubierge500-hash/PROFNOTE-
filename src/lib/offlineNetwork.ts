/**
 * État du réseau et configuration partagés par tout le mode hors ligne
 * (cache de lecture, copie locale des données, file d'écritures).
 */

type FetchLike = typeof fetch

// ---------------------------------------------------------------------------
// Configuration (renseignée une fois dans supabase.ts)
// ---------------------------------------------------------------------------

export interface OfflineConfig {
  /** Adresse du projet Supabase, ex. https://xxxx.supabase.co */
  baseUrl: string
  /** Clé publique (anon) du projet. */
  apiKey: string
  /** Renvoie un jeton d'accès valide (renouvelé si besoin), ou null s'il n'y a pas de session. */
  getAccessToken: () => Promise<string | null>
}

let config: OfflineConfig | null = null

export function configureOffline(next: OfflineConfig): void {
  config = next
}

export function getOfflineConfig(): OfflineConfig | null {
  return config
}

/** fetch « brut », sans cache : utilisé pour rejouer les écritures et copier les données. */
let rawFetch: FetchLike = (...args) => fetch(...args)

export function setRawFetch(next: FetchLike): void {
  rawFetch = next
}

export function getRawFetch(): FetchLike {
  return rawFetch
}

// ---------------------------------------------------------------------------
// Jeton d'accès → identifiant utilisateur (sans appel réseau)
// ---------------------------------------------------------------------------

export function userIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null
  const payload = token.split('.')[1]
  if (!payload) return null

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const parsed = JSON.parse(atob(padded)) as { sub?: unknown }
    return typeof parsed.sub === 'string' ? parsed.sub : null
  } catch {
    return null
  }
}

export function userIdFromAuthHeader(header: string | null): string | null {
  if (!header || !header.startsWith('Bearer ')) return null
  return userIdFromToken(header.slice(7))
}

// ---------------------------------------------------------------------------
// Réseau coupé ou instable
// ---------------------------------------------------------------------------

/** Après un échec réseau, on considère le réseau coupé pendant ce délai (évite d'attendre à chaque requête). */
const DOWN_WINDOW_MS = 20_000

let downUntil = 0
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // Un abonné défaillant ne doit pas bloquer les autres.
    }
  })
}

export function subscribeNetwork(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function markNetworkDown(): void {
  downUntil = Date.now() + DOWN_WINDOW_MS
  emit()
}

export function markNetworkUp(): void {
  if (downUntil !== 0) {
    downUntil = 0
    emit()
  }
}

export function isNavigatorOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function isNetworkLikelyDown(): boolean {
  return isNavigatorOffline() || Date.now() < downUntil
}

/** Reconnaît une erreur due à l'absence, à la lenteur ou à la coupure du réseau. */
export function looksLikeNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true

  const name = (error as { name?: string } | null | undefined)?.name
  if (name === 'AbortError' || name === 'TimeoutError') return true

  const message =
    typeof error === 'string'
      ? error
      : (error as { message?: string } | null | undefined)?.message ?? ''

  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|aborted|timeout|timed out/i.test(
    message
  )
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    downUntil = 0
    emit()
  })
  window.addEventListener('offline', emit)
}
