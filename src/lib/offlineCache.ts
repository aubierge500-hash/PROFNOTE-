/**
 * Couche « hors ligne » placée entre l'application et Supabase (fetch du client).
 *
 * LECTURES (GET/HEAD sur /rest/v1/) :
 *   - réseau disponible : réponse du serveur, copiée sur l'appareil pour plus tard ;
 *   - réseau coupé ou trop lent : réponse calculée depuis la copie locale des données,
 *     sinon dernière réponse identique déjà reçue ;
 *   - des modifications attendent leur envoi : on essaie de les envoyer d'abord, et à défaut
 *     on répond depuis la copie locale pour que l'enseignant voie ce qu'il vient de faire.
 *
 * ÉCRITURES (POST/PATCH/DELETE) :
 *   - réseau disponible : envoi normal ;
 *   - réseau coupé ou trop lent : la modification est gardée dans la file d'attente et
 *     confirmée à l'application ; elle part toute seule au retour d'internet.
 *
 * Aucune page n'a besoin d'être modifiée : tout passe par le client Supabase.
 */

import { dbClear, dbGet, dbPruneResponses, dbPut } from './offlineDb'
import {
  isNavigatorOffline,
  isNetworkLikelyDown,
  looksLikeNetworkError,
  markNetworkDown,
  markNetworkUp,
  setRawFetch,
  userIdFromAuthHeader
} from './offlineNetwork'
import {
  ensureOutboxLoaded,
  flushOutbox,
  getPendingCount,
  queueMutation,
  type WriteMethod
} from './offlineOutbox'
import { answerFromReplica, applyMutationToReplica, clearReplica } from './offlineReplica'
import { ID_TABLES, injectIds, type LocalResult } from './postgrestLocal'

type FetchLike = typeof fetch

/** Au-delà de ce délai, une lecture lente bascule sur la copie locale si elle existe. */
const READ_TIMEOUT_MS = 10_000
/** Une écriture qui n'aboutit pas dans ce délai est gardée pour plus tard. */
const WRITE_TIMEOUT_MS = 15_000
/** Les réponses mémorisées plus vieilles que cela sont supprimées. */
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000
/** Délai minimal entre deux tentatives d'envoi déclenchées par une lecture. */
const PRE_READ_FLUSH_INTERVAL_MS = 10_000

/** Tables jamais mises en file : paiements et abonnements exigent toujours internet. */
const ONLINE_ONLY_TABLES = new Set(['subscriptions'])

const WRITE_METHODS = new Set(['POST', 'PATCH', 'DELETE', 'PUT'])

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

// ---------------------------------------------------------------------------
// Cache des réponses de lecture (réponse identique déjà reçue)
// ---------------------------------------------------------------------------

function entryToResponse(entry: CachedEntry): Response {
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
    const entry: CachedEntry = {
      key,
      userId,
      savedAt: Date.now(),
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('Content-Type'),
      contentRange: response.headers.get('Content-Range'),
      body
    }
    await dbPut('responses', entry)
  } catch (error) {
    // Quota plein, mode privé… : le cache est un bonus, on n'interrompt jamais l'application.
    console.warn('[OfflineCache] Copie locale impossible :', error)
  }
}

async function readStoredResponse(key: string): Promise<Response | null> {
  try {
    const entry = await dbGet<CachedEntry>('responses', key)
    return entry ? entryToResponse(entry) : null
  } catch (error) {
    console.warn('[OfflineCache] Lecture de la copie locale impossible :', error)
    return null
  }
}

/** Vide les copies de lecture et la copie des données (à appeler à la déconnexion). */
export async function clearOfflineCache(): Promise<void> {
  try {
    await dbClear('responses')
  } catch (error) {
    console.warn('[OfflineCache] Impossible de vider le cache local :', error)
  }
  await clearReplica()
}

let pruned = false

function pruneOnce(): void {
  if (pruned) return
  pruned = true
  void dbPruneResponses(Date.now() - MAX_AGE_MS).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function tableFromUrl(url: string): string | null {
  const marker = '/rest/v1/'
  const start = url.indexOf(marker)
  if (start === -1) return null

  const path = url.slice(start + marker.length).split('?')[0]
  if (!path || path.startsWith('rpc/') || path.includes('/')) return null
  return decodeURIComponent(path)
}

function localToResponse(local: LocalResult, method: string): Response {
  const headers = new Headers({
    'Content-Type': local.contentType,
    'Content-Range': local.contentRange,
    'X-Profnote-Cache': 'replica'
  })
  return new Response(method === 'HEAD' ? null : local.body, { status: local.status, headers })
}

/** fetch avec délai maximum ; l'annulation voulue par l'application reste respectée. */
async function fetchWithTimeout(
  baseFetch: FetchLike,
  input: Parameters<FetchLike>[0],
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const callerSignal = init?.signal

  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await baseFetch(input, { ...init, signal: controller.signal })
  } finally {
    // Le délai ne concerne que l'arrivée de la réponse ; l'écouteur d'annulation reste en place
    // pour que l'application puisse encore interrompre la lecture du contenu.
    clearTimeout(timer)
  }
}

let lastPreReadFlush = 0

async function flushBeforeRead(): Promise<void> {
  if (getPendingCount() === 0 || isNetworkLikelyDown()) return
  if (Date.now() - lastPreReadFlush < PRE_READ_FLUSH_INTERVAL_MS) return

  lastPreReadFlush = Date.now()
  await flushOutbox({ maxMs: 8000 }).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

interface RequestContext {
  url: string
  method: string
  table: string
  userId: string
  headers: Headers
}

async function localAnswer(context: RequestContext): Promise<Response | null> {
  try {
    const local = await answerFromReplica(context.userId, {
      table: context.table,
      method: context.method === 'HEAD' ? 'HEAD' : 'GET',
      search: new URL(context.url).search,
      accept: context.headers.get('Accept') ?? '',
      prefer: context.headers.get('Prefer') ?? ''
    })
    return local ? localToResponse(local, context.method) : null
  } catch (error) {
    console.warn('[OfflineCache] Réponse locale impossible :', error)
    return null
  }
}

async function cachedRead(
  baseFetch: FetchLike,
  input: Parameters<FetchLike>[0],
  init: RequestInit | undefined,
  context: RequestContext
): Promise<Response> {
  await ensureOutboxLoaded()
  pruneOnce()

  const key = `${context.userId}|${context.method}|${context.headers.get('Accept') ?? ''}|${context.url}`

  // Des modifications attendent : on tente de les envoyer avant de lire, pour lire le résultat à jour.
  await flushBeforeRead()

  // Réseau coupé, ou modifications encore en attente : la copie locale est la source la plus juste.
  if (isNetworkLikelyDown() || getPendingCount() > 0) {
    const local = await localAnswer(context)
    if (local) return local

    if (isNetworkLikelyDown()) {
      const stored = await readStoredResponse(key)
      if (stored) return stored
      if (isNavigatorOffline()) throw new TypeError('Failed to fetch')
    }
  }

  try {
    const response = await fetchWithTimeout(baseFetch, input, init, READ_TIMEOUT_MS)
    markNetworkUp()
    if (response.ok) void storeResponse(key, context.userId, response.clone())
    return response
  } catch (error) {
    // Annulation voulue par l'application : on ne la masque pas.
    if (init?.signal?.aborted) throw error

    if (looksLikeNetworkError(error)) markNetworkDown()

    const local = await localAnswer(context)
    if (local) return local

    const stored = await readStoredResponse(key)
    if (stored) return stored

    throw error
  }
}

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

async function tryQueue(
  context: RequestContext,
  body: string | null
): Promise<Response | null> {
  const headers: Record<string, string> = {}
  context.headers.forEach((value, name) => {
    if (name.toLowerCase() !== 'authorization') headers[name] = value
  })

  try {
    return await queueMutation({
      userId: context.userId,
      table: context.table,
      method: context.method as WriteMethod,
      url: context.url,
      headers,
      body
    })
  } catch (error) {
    console.error('[OfflineCache] Modification impossible à garder hors ligne :', error)
    return null
  }
}

/** Après un envoi réussi, la copie locale reflète aussi la modification (sans attendre la prochaine copie). */
function mirrorOnReplica(context: RequestContext, body: string | null): void {
  let parsed: unknown = null
  if (body !== null) {
    try {
      parsed = JSON.parse(body)
    } catch {
      return
    }
  }

  void applyMutationToReplica({
    userId: context.userId,
    table: context.table,
    method: context.method as WriteMethod,
    search: new URL(context.url).search,
    body: parsed,
    prefer: context.headers.get('Prefer') ?? ''
  }).catch(() => undefined)
}

/** Les ajouts groupés du client Supabase listent les colonnes à enregistrer (?columns=…) : on y ajoute « id ». */
function ensureIdColumn(url: string): string {
  const parsed = new URL(url)
  const columns = parsed.searchParams.get('columns')
  if (columns === null || /(^|,)"id"(,|$)/.test(columns)) return url

  parsed.searchParams.set('columns', columns === '' ? '"id"' : `${columns},"id"`)
  return parsed.toString()
}

async function cachedWrite(
  baseFetch: FetchLike,
  input: string,
  init: RequestInit | undefined,
  context: RequestContext
): Promise<Response> {
  await ensureOutboxLoaded()

  let body = typeof init?.body === 'string' ? init.body : null
  const prefer = context.headers.get('Prefer') ?? ''
  const isUpsert = /resolution=(merge|ignore)-duplicates/.test(prefer)

  let target = input
  let ctx = context

  // L'identifiant est choisi ici (et non par le serveur) : un renvoi ne peut jamais créer de doublon.
  if (context.method === 'POST' && body !== null && !isUpsert && ID_TABLES.has(context.table)) {
    body = injectIds(body)
    target = ensureIdColumn(input)
    ctx = { ...context, url: target }
  }

  const sendInit: RequestInit | undefined =
    body !== null && body !== init?.body ? { ...init, body } : init

  // Des modifications attendent déjà : celle-ci passe derrière elles pour garder l'ordre.
  if (getPendingCount() > 0 || isNetworkLikelyDown()) {
    const queued = await tryQueue(ctx, body)
    if (queued) {
      if (!isNetworkLikelyDown()) void flushOutbox().catch(() => undefined)
      return queued
    }
    return baseFetch(target, sendInit)
  }

  try {
    const response = await fetchWithTimeout(baseFetch, target, sendInit, WRITE_TIMEOUT_MS)
    markNetworkUp()
    if (response.ok) mirrorOnReplica(ctx, body)
    return response
  } catch (error) {
    if (init?.signal?.aborted) throw error
    if (!looksLikeNetworkError(error)) throw error

    markNetworkDown()

    const queued = await tryQueue(ctx, body)
    if (queued) return queued

    throw error
  }
}

// ---------------------------------------------------------------------------
// fetch à passer à createClient({ global: { fetch } })
// ---------------------------------------------------------------------------

export function createCachedFetch(baseFetch: FetchLike = (...args) => fetch(...args)): FetchLike {
  setRawFetch(baseFetch)

  return async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url

    const table = tableFromUrl(url)
    if (!table) return baseFetch(input, init)

    const method = (
      init?.method ?? (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')
    ).toUpperCase()

    const headers = new Headers(
      init?.headers ?? (typeof input === 'object' && 'headers' in input ? (input as Request).headers : undefined)
    )

    const userId = userIdFromAuthHeader(headers.get('Authorization'))
    // Pas d'utilisateur connecté (jeton anonyme) : rien n'est gardé, rien n'est mis en file.
    if (!userId) return baseFetch(input, init)

    const context: RequestContext = { url, method, table, userId, headers }

    if (method === 'GET' || method === 'HEAD') {
      return cachedRead(baseFetch, input, init, context)
    }

    if (WRITE_METHODS.has(method) && !ONLINE_ONLY_TABLES.has(table) && typeof input === 'string') {
      return cachedWrite(baseFetch, input, init, context)
    }

    return baseFetch(input, init)
  }
}

