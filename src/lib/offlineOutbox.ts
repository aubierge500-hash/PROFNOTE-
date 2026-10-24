/**
 * File d'attente des modifications faites sans internet.
 *
 * Quand une création, modification ou suppression ne peut pas partir (réseau coupé ou trop
 * lent), elle est :
 *   1. enregistrée dans l'ordre sur l'appareil (outbox),
 *   2. appliquée à la copie locale des données (l'écran se met à jour tout de suite),
 *   3. confirmée à l'application comme si le serveur avait répondu.
 * Au retour du réseau, flushOutbox() rejoue les modifications dans l'ordre.
 *
 * Les créations portent un identifiant (uuid) choisi par l'appareil : les modifications
 * suivantes peuvent s'y référer, et un renvoi accidentel ne crée jamais de doublon.
 */

import { dbAdd, dbCount, dbDelete, dbGetAll, dbPut, dbClear } from './offlineDb'
import {
  getOfflineConfig,
  getRawFetch,
  isNavigatorOffline,
  looksLikeNetworkError,
  markNetworkDown,
  markNetworkUp,
  userIdFromToken,
  type OfflineConfig
} from './offlineNetwork'
import { applyMutationToReplica } from './offlineReplica'
import { parseQuery, type Row } from './postgrestLocal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WriteMethod = 'POST' | 'PATCH' | 'DELETE' | 'PUT'

export interface OutboxEntry {
  seq?: number
  userId: string
  table: string
  method: WriteMethod
  /** Adresse complète de la requête d'origine. */
  url: string
  /** En-têtes d'origine, sans Authorization (le jeton est renouvelé à l'envoi). */
  headers: Record<string, string>
  body: string | null
  createdAt: number
}

export interface FailedEntry extends OutboxEntry {
  seq: number
  error: string
  failedAt: number
}

export interface QueuedMutation {
  userId: string
  table: string
  method: WriteMethod
  url: string
  headers: Record<string, string>
  body: string | null
}

export interface FlushResult {
  sent: number
  failed: number
  stopped: null | 'network' | 'auth' | 'server' | 'offline' | 'config' | 'locked'
}

// ---------------------------------------------------------------------------
// Compteurs et abonnements
// ---------------------------------------------------------------------------

let pendingCount = 0
let failedCount = 0
let flushing = false
let loadPromise: Promise<void> | null = null
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

async function recount(): Promise<void> {
  try {
    pendingCount = await dbCount('outbox')
    failedCount = await dbCount('failed')
  } catch (error) {
    console.warn('[Outbox] Comptage impossible :', error)
  }
  emit()
}

/** À attendre avant la première lecture/écriture : charge le nombre de modifications en attente. */
export function ensureOutboxLoaded(): Promise<void> {
  if (!loadPromise) loadPromise = recount()
  return loadPromise
}

export function getPendingCount(): number {
  return pendingCount
}

export function getFailedCount(): number {
  return failedCount
}

export function isFlushing(): boolean {
  return flushing
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function headerValue(headers: Record<string, string>, name: string): string {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value
  }
  return ''
}

// ---------------------------------------------------------------------------
// Mise en file d'une modification
// ---------------------------------------------------------------------------

const OFFLINE_HEADER = { 'X-Profnote-Offline': 'queued' }

function buildResponse(
  mutation: QueuedMutation,
  affected: Row[] | null,
  parsedBody: unknown,
  wantsRepresentation: boolean,
  single: boolean,
  search: string
): Response {
  if (mutation.method === 'DELETE') {
    return new Response(null, { status: 204, headers: OFFLINE_HEADER })
  }

  const successStatus = mutation.method === 'POST' ? 201 : 200

  if (!wantsRepresentation) {
    return new Response(null, {
      status: mutation.method === 'POST' ? 201 : 204,
      headers: OFFLINE_HEADER
    })
  }

  let rows: Row[]
  if (affected && affected.length > 0) {
    rows = affected
  } else if (mutation.method === 'POST') {
    rows = (Array.isArray(parsedBody) ? parsedBody : [parsedBody]) as Row[]
  } else {
    // Ligne inconnue de la copie locale : on reconstitue ce qu'on sait (filtres « = » + valeurs modifiées).
    const known: Row = {}
    for (const filter of parseQuery(search).filters) {
      if (filter.op === 'eq' && !filter.negate) known[filter.column] = filter.value
    }
    rows = single ? [{ ...known, ...(parsedBody as Row) }] : []
  }

  if (single) {
    if (rows.length !== 1) {
      return new Response(
        JSON.stringify({
          code: 'PGRST116',
          details: `The result contains ${rows.length} rows`,
          hint: null,
          message: 'JSON object requested, multiple (or no) rows returned'
        }),
        {
          status: 406,
          headers: { ...OFFLINE_HEADER, 'Content-Type': 'application/json; charset=utf-8' }
        }
      )
    }

    return new Response(JSON.stringify(rows[0]), {
      status: successStatus,
      headers: {
        ...OFFLINE_HEADER,
        'Content-Type': 'application/vnd.pgrst.object+json; charset=utf-8'
      }
    })
  }

  return new Response(JSON.stringify(rows), {
    status: successStatus,
    headers: { ...OFFLINE_HEADER, 'Content-Type': 'application/json; charset=utf-8' }
  })
}

/**
 * Garde la modification sur l'appareil, l'applique à la copie locale et renvoie la réponse
 * que le serveur aurait donnée. Lève une erreur si la modification n'a pas pu être gardée.
 */
export async function queueMutation(mutation: QueuedMutation): Promise<Response> {
  await ensureOutboxLoaded()

  let parsedBody: unknown = null
  if (mutation.body !== null) {
    try {
      parsedBody = JSON.parse(mutation.body)
    } catch {
      throw new Error('Corps de requête illisible : impossible de le garder hors ligne.')
    }
  }

  const search = new URL(mutation.url).search
  const prefer = headerValue(mutation.headers, 'prefer')
  const accept = headerValue(mutation.headers, 'accept')
  const wantsRepresentation = /return=representation/.test(prefer)
  const single = /vnd\.pgrst\.object/.test(accept)

  // 1) La file d'abord : si l'enregistrement échoue, rien d'autre n'est modifié.
  const entry: OutboxEntry = {
    userId: mutation.userId,
    table: mutation.table,
    method: mutation.method,
    url: mutation.url,
    headers: mutation.headers,
    body: mutation.body,
    createdAt: Date.now()
  }
  await dbAdd('outbox', entry)

  // 2) Effet immédiat sur les données affichées.
  let affected: Row[] | null = null
  try {
    affected = await applyMutationToReplica({
      userId: mutation.userId,
      table: mutation.table,
      method: mutation.method,
      search,
      body: parsedBody,
      prefer
    })
  } catch (error) {
    console.warn('[Outbox] Effet local impossible (la modification reste en attente) :', error)
  }

  await recount()

  // 3) Réponse « comme le serveur ».
  return buildResponse(mutation, affected, parsedBody, wantsRepresentation, single, search)
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

const SEND_TIMEOUT_MS = 30_000

type Outcome = 'sent' | 'failed' | 'network' | 'auth' | 'server'

async function errorMessage(response: Response): Promise<{ code: string; message: string }> {
  try {
    const data = (await response.json()) as { code?: string; message?: string }
    return { code: data.code ?? '', message: data.message ?? `Erreur ${response.status}` }
  } catch {
    return { code: '', message: `Erreur ${response.status}` }
  }
}

async function moveToFailed(entry: OutboxEntry, message: string): Promise<void> {
  const failed: FailedEntry = {
    ...entry,
    seq: entry.seq as number,
    error: message,
    failedAt: Date.now()
  }
  await dbPut('failed', failed)
  await dbDelete('outbox', entry.seq as number)
}

async function sendEntry(entry: OutboxEntry, token: string, config: OfflineConfig): Promise<Outcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)

  let response: Response
  try {
    response = await getRawFetch()(entry.url, {
      method: entry.method,
      headers: { ...entry.headers, apikey: config.apiKey, Authorization: `Bearer ${token}` },
      body: entry.body ?? undefined,
      signal: controller.signal
    })
  } catch (error) {
    if (looksLikeNetworkError(error)) markNetworkDown()
    return 'network'
  } finally {
    clearTimeout(timer)
  }

  markNetworkUp()

  if (response.ok) {
    await dbDelete('outbox', entry.seq as number)
    return 'sent'
  }

  if (response.status === 401) return 'auth'
  if (response.status >= 500 || response.status === 429 || response.status === 408) return 'server'

  const { code, message } = await errorMessage(response)

  // Création déjà reçue par le serveur lors d'une tentative précédente (réponse perdue) : c'est un succès.
  if (response.status === 409 && code === '23505' && entry.method === 'POST') {
    await dbDelete('outbox', entry.seq as number)
    return 'sent'
  }

  await moveToFailed(entry, message)
  return 'failed'
}

async function doFlush(): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, stopped: null }

  const config = getOfflineConfig()
  if (!config) {
    result.stopped = 'config'
    return result
  }

  let token: string | null
  try {
    token = await config.getAccessToken()
  } catch {
    markNetworkDown()
    result.stopped = 'network'
    return result
  }

  const userId = userIdFromToken(token)
  if (!token || !userId) {
    result.stopped = 'auth'
    return result
  }

  flushing = true
  emit()

  try {
    for (;;) {
      const entries = (await dbGetAll<OutboxEntry>('outbox'))
        .filter((entry) => entry.userId === userId)
        .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

      if (entries.length === 0) break

      for (const entry of entries) {
        const outcome = await sendEntry(entry, token, config)

        if (outcome === 'sent') {
          result.sent += 1
        } else if (outcome === 'failed') {
          result.failed += 1
        } else {
          result.stopped = outcome
          break
        }
      }

      if (result.stopped) break
    }
  } finally {
    flushing = false
    await recount()
  }

  return result
}

async function runFlush(): Promise<FlushResult> {
  await ensureOutboxLoaded()

  if (pendingCount === 0) return { sent: 0, failed: 0, stopped: null }
  if (isNavigatorOffline()) return { sent: 0, failed: 0, stopped: 'offline' }

  // Un seul onglet à la fois envoie les modifications (évite les doublons entre onglets).
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (locks) {
    return locks.request('profnote-outbox-flush', { ifAvailable: true }, async (lock) => {
      if (!lock) return { sent: 0, failed: 0, stopped: 'locked' } as FlushResult
      return doFlush()
    })
  }

  return doFlush()
}

let flushPromise: Promise<FlushResult> | null = null

/**
 * Envoie les modifications en attente (une seule passe à la fois).
 * `maxMs` : rend la main après ce délai, l'envoi continue en arrière-plan.
 */
export function flushOutbox(options: { maxMs?: number } = {}): Promise<FlushResult> {
  if (!flushPromise) {
    flushPromise = runFlush().finally(() => {
      flushPromise = null
    })
  }

  const current = flushPromise
  if (!options.maxMs) return current

  return Promise.race([
    current,
    new Promise<FlushResult>((resolve) => {
      setTimeout(() => resolve({ sent: 0, failed: 0, stopped: null }), options.maxMs)
    })
  ])
}

// ---------------------------------------------------------------------------
// Modifications refusées par le serveur
// ---------------------------------------------------------------------------

export async function listFailed(): Promise<FailedEntry[]> {
  const entries = await dbGetAll<FailedEntry>('failed')
  return entries.sort((a, b) => a.seq - b.seq)
}

/** Abandonne définitivement les modifications refusées. */
export async function discardFailed(): Promise<void> {
  await dbClear('failed')
  await recount()
}

/** Remet les modifications refusées dans la file pour un nouvel essai. */
export async function requeueFailed(): Promise<void> {
  const entries = await listFailed()

  for (const failed of entries) {
    const { seq, error, failedAt, ...entry } = failed
    void error
    void failedAt
    await dbAdd('outbox', entry)
    await dbDelete('failed', seq)
  }

  await recount()
}

// ---------------------------------------------------------------------------
// Libellés lisibles
// ---------------------------------------------------------------------------

const TABLE_LABELS: Record<string, string> = {
  classes: 'classe',
  students: 'élève',
  evaluations: 'évaluation',
  grades: 'note',
  whatsapp_history: 'message WhatsApp',
  profiles: 'profil',
  bulletin_entries: 'bulletin',
  bulletin_templates: 'modèle de bulletin',
  bulletin_student_records: 'fiche de bulletin'
}

export function describeEntry(entry: Pick<OutboxEntry, 'table' | 'method'>): string {
  const action =
    entry.method === 'POST' ? 'Création' : entry.method === 'DELETE' ? 'Suppression' : 'Modification'
  return `${action} · ${TABLE_LABELS[entry.table] ?? entry.table}`
}
