import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createCachedFetch } from './offlineCache'
import { readStoredSession } from './offlineAccess'
import { configureOffline } from './offlineNetwork'
import { startOfflineSync, syncNow } from './offlineSync'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes. Copiez .env.example vers .env.local.'
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    // Lectures et écritures passent par la couche hors ligne : copie locale des données,
    // file d'attente des modifications faites sans internet.
    fetch: createCachedFetch()
  }
})

/**
 * Sans réseau, si le jeton d'accès a expiré, Supabase essaie de le renouveler pendant ~25 s
 * avant d'abandonner, et chaque requête de l'application attend derrière. On court-circuite :
 * hors ligne (ou si le renouvellement traîne), on renvoie la session déjà enregistrée sur
 * l'appareil. Le renouvellement réel reprend tout seul dès que le réseau revient.
 */
const REFRESH_WAIT_MS = 4000
const STALL_MEMORY_MS = 60_000
let refreshStalledUntil = 0

const originalGetSession = supabase.auth.getSession.bind(supabase.auth)

supabase.auth.getSession = (async () => {
  const stored = readStoredSession()

  if (!stored) return originalGetSession()

  if (!navigator.onLine || Date.now() < refreshStalledUntil) {
    return { data: { session: stored }, error: null }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), REFRESH_WAIT_MS)
  })

  const result = await Promise.race([originalGetSession(), timeout])
  if (timer) clearTimeout(timer)

  if (result === 'timeout') {
    refreshStalledUntil = Date.now() + STALL_MEMORY_MS
    return { data: { session: stored }, error: null }
  }

  return result
}) as unknown as typeof supabase.auth.getSession

/**
 * Envoi des modifications faites sans internet : il faut un jeton valide, renouvelé si besoin.
 * On interroge la vraie méthode (pas la version raccourcie ci-dessus) avec un délai maximum.
 */
configureOffline({
  baseUrl: supabaseUrl,
  apiKey: supabaseAnonKey,
  getAccessToken: async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), 8000)
    })

    try {
      const { data } = await Promise.race([originalGetSession(), timeout])
      return data.session?.access_token ?? null
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
})

startOfflineSync()

// Dès qu'une session est (re)établie, on envoie ce qui attend et on prépare le mode hors ligne.
// Le rappel est différé : il ne doit pas appeler Supabase pendant que Supabase le notifie.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    setTimeout(() => {
      void syncNow()
    }, 0)
  }
})
