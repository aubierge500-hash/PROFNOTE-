import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createCachedFetch } from './offlineCache'
import { readStoredSession } from './offlineAccess'

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
    // Les lectures réussies sont copiées sur l'appareil et resservies sans réseau.
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
