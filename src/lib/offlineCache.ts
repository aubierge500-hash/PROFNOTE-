/**
 * Cache de lecture hors ligne pour Supabase.
 *
 * Principe : chaque requête de LECTURE (GET/HEAD sur /rest/v1/) qui réussit est copiée dans
 * IndexedDB, séparément pour chaque utilisateur. Quand le réseau est coupé (ou trop lent),
 * la dernière copie connue est renvoyée à la place. Aucune page n'a besoin d'être modifiée.
 *
 * Les écritures (POST/PATCH/DELETE) ne sont PAS interceptées ici : elles échouent hors ligne
 * comme avant (la saisie des notes garde son brouillon local géré dans ClassDetail).
 */

const DB_NAME = 'profnote-http-cache'
const STORE_NAME = 'responses'
const DB_VERSION = 1

/** Au-delà de ce délai, une lecture lente bascule sur la copie locale si elle existe. */
const READ_TIMEOUT_MS = 10_000
/** Les copies plus vieilles que cela sont supprimées. */
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000

interface CachedEntry {
  key: string
  userId: string
  savedAt: number
  status: number
  statusText: string
  contentType: string | null
  contentRange: string | null
  body: string
}

type FetchLike = typeof fetch

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        store.createIndex('savedAt', 'savedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function putEntry(entry: CachedEntry): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(entry)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error ?? new Error('Écriture du cache annulée.'))
    }
  })
}

async function getEntry(key: string): Promise<CachedEntry | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => {
      db.close()
      resolve((request.result as CachedEntry | undefined) ?? null)
    }
    request.onerror = () => {
      db.close()
      reject(request.error)
    }
  })
}

async function deleteOlderThan(timestamp: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const index = tx.objectStore(STORE_NAME).index('savedAt')
    const range = IDBKeyRange.upperBound(timestamp)
    const cursorRequest = index.openCursor(range)

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error ?? new Error('Nettoyage du cache annulé.'))
    }
  })
}

/** Vide tout le cache de données (à appeler à la déconnexion). */
export async function clearOfflineCache(): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
      tx.onabort = () => {
        db.close()
        reject(tx.error ?? new Error('Vidage du cache annulé.'))
      }
    })
  } catch (error) {
    console.warn('[OfflineCache] Impossible de vider le cache local :', error)
  }
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Lit l'identifiant utilisateur (claim "sub") dans le jeton Bearer, sans appel réseau. */
function userIdFromAuthHeader(header: string | null): string | null {
  if (!header || !header.startsWith('Bearer ')) return null
  const payload = header.slice(7).split('.')[1]
  if (!payload) return null

  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const parsed = JSON.parse(json) as { sub?: unknown }
    return typeof parsed.sub === 'string' ? parsed.sub : null
  } catch {
    return null
  }
}

function toResponse(entry: CachedEntry): Response {
  const headers = new Headers()
  if (entry.contentType) headers.set('Content-Type', entry.contentType)
  if (entry.contentRange) headers.set('Content-Range', entry.contentRange)
  headers.set('X-Profnote-Cache', 'hit')

  const noBody = entry.status === 204 || entry.status === 205
  return new Response(noBody ? null : entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers
  })
}

async function storeResponse(key: string, userId: string, response: Response): Promise<void> {
  try {
    const body = await response.text()
    await putEntry({
      key,
      userId,
      savedAt: Date.now(),
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('Content-Type'),
      contentRange: response.headers.get('Content-Range'),
      body
    })
  } catch (error) {
    // Quota plein, mode privé, etc. : le cache est un bonus, on n'interrompt jamais l'application.
    console.warn('[OfflineCache] Copie locale impossible :', error)
  }
}

// ---------------------------------------------------------------------------
// fetch avec cache, à passer à createClient({ global: { fetch } })
// ---------------------------------------------------------------------------

let pruned = false

export function createCachedFetch(baseFetch: FetchLike = (...args) => fetch(...args)): FetchLike {
  return async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url

    const method = (
      init?.method ?? (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')
    ).toUpperCase()

    const cacheable = url.includes('/rest/v1/') && (method === 'GET' || method === 'HEAD')
    if (!cacheable) return baseFetch(input, init)

    const headers = new Headers(
      init?.headers ?? (typeof input === 'object' && 'headers' in input ? (input as Request).headers : undefined)
    )
    const userId = userIdFromAuthHeader(headers.get('Authorization'))
    // Pas d'utilisateur connecté (jeton anonyme) : on ne met rien en cache.
    if (!userId) return baseFetch(input, init)

    if (!pruned) {
      pruned = true
      void deleteOlderThan(Date.now() - MAX_AGE_MS).catch(() => undefined)
    }

    const key = `${userId}|${method}|${headers.get('Accept') ?? ''}|${url}`

    // Délai maximum : sur une connexion très lente, on bascule sur la copie locale.
    const controller = new AbortController()
    const callerSignal = init?.signal
    const onCallerAbort = () => controller.abort()
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort()
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true })
    }
    const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS)

    try {
      const response = await baseFetch(input, { ...init, signal: controller.signal })
      if (response.ok) void storeResponse(key, userId, response.clone())
      return response
    } catch (error) {
      // Annulation volontaire par l'application : on ne cache pas la réponse.
      if (callerSignal?.aborted) throw error

      try {
        const cached = await getEntry(key)
        if (cached) return toResponse(cached)
      } catch (cacheError) {
        console.warn('[OfflineCache] Lecture de la copie locale impossible :', cacheError)
      }
      throw error
    } finally {
      // Le délai ne concerne que l'arrivée de la réponse. On laisse volontairement l'écouteur
      // d'annulation en place : l'application doit pouvoir interrompre une lecture en cours.
      clearTimeout(timer)
    }
  }
}
