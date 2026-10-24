/**
 * Copie locale des données de l'enseignant (classes, élèves, évaluations, notes…).
 *
 * - Remplie en arrière-plan quand il y a internet (syncReplica).
 * - Interrogée sans réseau par le moteur de requêtes local (answerFromReplica).
 * - Tenue à jour par chaque modification faite dans l'application (applyMutationToReplica),
 *   y compris les suppressions en cascade que le serveur ferait lui-même.
 */

import { dbClear, dbGetAll, dbPut } from './offlineDb'
import { getOfflineConfig, getRawFetch, userIdFromToken } from './offlineNetwork'
import {
  buildInsertRows,
  matchRow,
  parseQuery,
  runLocalQuery,
  VIEW_TABLES,
  type LocalRequest,
  type LocalResult,
  type Row
} from './postgrestLocal'

/** Tables copiées. `owner` = colonne qui désigne le propriétaire des lignes. */
export const REPLICA_TABLES: Record<string, { owner: string; requireFilter?: string }> = {
  classes: { owner: 'teacher_id' },
  students: { owner: 'teacher_id' },
  evaluations: { owner: 'teacher_id' },
  grades: { owner: 'teacher_id' },
  whatsapp_history: { owner: 'teacher_id' },
  bulletin_student_records: { owner: 'teacher_id' },
  bulletin_entries: { owner: 'user_id' },
  bulletin_templates: { owner: 'user_id' },
  // Un administrateur voit tous les profils : on ne répond localement que pour « id = moi ».
  profiles: { owner: 'id', requireFilter: 'id' }
}

/** Suppressions en cascade faites par la base (ON DELETE CASCADE / SET NULL). */
const CASCADES: Record<string, Array<{ table: string; column: string; action: 'delete' | 'null' }>> = {
  classes: [
    { table: 'students', column: 'class_id', action: 'delete' },
    { table: 'evaluations', column: 'class_id', action: 'delete' },
    { table: 'bulletin_entries', column: 'class_id', action: 'delete' },
    { table: 'whatsapp_history', column: 'class_id', action: 'null' }
  ],
  students: [
    { table: 'grades', column: 'student_id', action: 'delete' },
    { table: 'bulletin_entries', column: 'student_id', action: 'delete' },
    { table: 'bulletin_student_records', column: 'student_id', action: 'delete' },
    { table: 'whatsapp_history', column: 'student_id', action: 'delete' }
  ],
  evaluations: [
    { table: 'grades', column: 'evaluation_id', action: 'delete' },
    { table: 'whatsapp_history', column: 'evaluation_id', action: 'null' }
  ]
}

const PAGE_SIZE = 1000
const REQUEST_TIMEOUT_MS = 30_000

interface ReplicaRecord {
  key: string
  userId: string
  table: string
  rows: Row[]
  syncedAt: number
}

// ---------------------------------------------------------------------------
// État en mémoire
// ---------------------------------------------------------------------------

const tables = new Map<string, ReplicaRecord>()
const loading = new Map<string, Promise<void>>()
const loaded = new Set<string>()
const listeners = new Set<() => void>()

let syncing = false
let syncPromise: Promise<boolean> | null = null
let chain: Promise<unknown> = Promise.resolve()

function recordKey(userId: string, table: string): string {
  return `${userId}|${table}`
}

function emit(): void {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // Un abonné défaillant ne doit pas bloquer les autres.
    }
  })
}

export function subscribeReplica(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isReplicaSyncing(): boolean {
  return syncing
}

/** Exécute les tâches une par une pour éviter que deux modifications se croisent. */
function inOrder<T>(task: () => Promise<T>): Promise<T> {
  const result = chain.then(task, task)
  chain = result.catch(() => undefined)
  return result
}

async function loadUser(userId: string): Promise<void> {
  if (loaded.has(userId)) return

  let pending = loading.get(userId)
  if (!pending) {
    pending = (async () => {
      const records = await dbGetAll<ReplicaRecord>('replica')
      for (const record of records) {
        if (record.userId === userId && !tables.has(record.key)) {
          tables.set(record.key, record)
        }
      }
      loaded.add(userId)
    })().finally(() => {
      loading.delete(userId)
    })
    loading.set(userId, pending)
  }

  await pending
}

async function persist(record: ReplicaRecord): Promise<void> {
  try {
    await dbPut('replica', record)
  } catch (error) {
    // Stockage plein ou indisponible : la copie en mémoire reste valable pour cette session.
    console.warn('[Replica] Enregistrement local impossible :', error)
  }
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function answerFromReplica(
  userId: string,
  request: LocalRequest
): Promise<LocalResult | null> {
  const config = REPLICA_TABLES[request.table]
  if (!config && !VIEW_TABLES.has(request.table)) return null

  await loadUser(userId)

  if (config?.requireFilter) {
    const query = parseQuery(request.search)
    const constrained = query.filters.some(
      (filter) => filter.column === config.requireFilter && filter.op === 'eq' && !filter.negate
    )
    if (!constrained) return null
  }

  return runLocalQuery(request, (name) => tables.get(recordKey(userId, name))?.rows ?? null)
}

export interface ReplicaStatus {
  ready: boolean
  syncedAt: number | null
}

export async function getReplicaStatus(userId: string): Promise<ReplicaStatus> {
  await loadUser(userId)

  const records = Object.keys(REPLICA_TABLES).map((table) => tables.get(recordKey(userId, table)))
  const ready = records.every((record) => record !== undefined)
  const dates = records
    .filter((record): record is ReplicaRecord => record !== undefined)
    .map((record) => record.syncedAt)

  return { ready, syncedAt: dates.length > 0 ? Math.min(...dates) : null }
}

// ---------------------------------------------------------------------------
// Modifications
// ---------------------------------------------------------------------------

export interface MutationInput {
  userId: string
  table: string
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  /** Partie « ?filtres » de l'adresse. */
  search: string
  /** Corps JSON déjà décodé (null pour une suppression). */
  body: unknown
  /** En-tête Prefer de la requête. */
  prefer: string
}

function sameValue(a: unknown, b: unknown): boolean {
  return a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b)
}

function cascadeDelete(userId: string, table: string, ids: unknown[], touched: Set<string>): void {
  const idSet = new Set(ids.filter((id) => id !== null && id !== undefined).map(String))
  if (idSet.size === 0) return

  for (const rule of CASCADES[table] ?? []) {
    const record = tables.get(recordKey(userId, rule.table))
    if (!record) continue

    if (rule.action === 'delete') {
      const removed = record.rows.filter((row) => idSet.has(String(row[rule.column])))
      if (removed.length > 0) {
        record.rows = record.rows.filter((row) => !idSet.has(String(row[rule.column])))
        touched.add(rule.table)
        cascadeDelete(
          userId,
          rule.table,
          removed.map((row) => row.id),
          touched
        )
      }
    } else {
      let changed = false
      record.rows = record.rows.map((row) => {
        if (idSet.has(String(row[rule.column]))) {
          changed = true
          return { ...row, [rule.column]: null }
        }
        return row
      })
      if (changed) touched.add(rule.table)
    }
  }
}

function mergeRow(row: Row, patch: Row, table: string, nowIso: string): Row {
  const next: Row = { ...row, ...patch }
  if ('updated_at' in row && patch.updated_at === undefined && table !== 'whatsapp_history') {
    next.updated_at = nowIso
  }
  return next
}

/**
 * Applique une création / modification / suppression à la copie locale.
 * Renvoie les lignes concernées (pour répondre comme le serveur), ou null si la table
 * n'est pas copiée ou si la requête n'est pas interprétable (le serveur tranchera à l'envoi).
 */
export function applyMutationToReplica(mutation: MutationInput): Promise<Row[] | null> {
  return inOrder(async () => {
    if (!REPLICA_TABLES[mutation.table]) return null

    await loadUser(mutation.userId)
    const record = tables.get(recordKey(mutation.userId, mutation.table))
    if (!record) return null

    const now = new Date()
    const nowIso = now.toISOString()
    const touched = new Set<string>([mutation.table])
    let result: Row[] = []

    if (mutation.method === 'POST') {
      const provided = (Array.isArray(mutation.body) ? mutation.body : [mutation.body]).filter(
        (item): item is Row => typeof item === 'object' && item !== null && !Array.isArray(item)
      )
      const built = buildInsertRows(mutation.table, provided, mutation.userId, now)
      const isUpsert = /resolution=(merge|ignore)-duplicates/.test(mutation.prefer)

      if (!isUpsert) {
        for (const row of built) {
          const index = record.rows.findIndex((existing) => sameValue(existing.id, row.id))
          if (index >= 0) record.rows[index] = row
          else record.rows.push(row)
        }
        result = built
      } else {
        const query = parseQuery(mutation.search)
        const keys = query.onConflict.length > 0 ? query.onConflict : ['id']
        const ignore = /ignore-duplicates/.test(mutation.prefer)

        built.forEach((row, position) => {
          const index = record.rows.findIndex((existing) =>
            keys.every((column) => sameValue(existing[column], row[column]))
          )

          if (index < 0) {
            record.rows.push(row)
            result.push(row)
          } else if (!ignore) {
            // Fusion : seules les colonnes réellement fournies écrasent l'existant.
            const merged = mergeRow(record.rows[index], provided[position], mutation.table, nowIso)
            record.rows[index] = merged
            result.push(merged)
          }
        })
      }
    } else if (mutation.method === 'PATCH') {
      const query = parseQuery(mutation.search)
      const patch = mutation.body
      // Sans filtre ou avec une syntaxe inconnue : on n'ose pas deviner quelles lignes sont visées.
      if (query.unsupported || query.filters.length === 0) return null
      if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return null

      const updated: Row[] = []
      record.rows = record.rows.map((row) => {
        if (!matchRow(row, query.filters)) return row
        const next = mergeRow(row, patch as Row, mutation.table, nowIso)
        updated.push(next)
        return next
      })
      result = updated
    } else if (mutation.method === 'DELETE') {
      const query = parseQuery(mutation.search)
      if (query.unsupported || query.filters.length === 0) return null

      const removed = record.rows.filter((row) => matchRow(row, query.filters))
      record.rows = record.rows.filter((row) => !matchRow(row, query.filters))
      cascadeDelete(
        mutation.userId,
        mutation.table,
        removed.map((row) => row.id),
        touched
      )
      result = removed
    } else {
      return null
    }

    for (const table of touched) {
      const touchedRecord = tables.get(recordKey(mutation.userId, table))
      if (touchedRecord) await persist(touchedRecord)
    }
    emit()

    return result
  })
}

// ---------------------------------------------------------------------------
// Synchronisation complète depuis le serveur
// ---------------------------------------------------------------------------

export interface ReplicaSyncOptions {
  userId: string
  /** Interrompt la copie (ex. des modifications en attente ou le réseau vient de couper). */
  shouldAbort: () => boolean
}

async function fetchPage(url: string, apiKey: string, token: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await getRawFetch()(url, {
      headers: { apikey: apiKey, Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
}

async function runSync(options: ReplicaSyncOptions): Promise<boolean> {
  const config = getOfflineConfig()
  if (!config) return false

  const token = await config.getAccessToken()
  if (!token || userIdFromToken(token) !== options.userId) return false

  const fetched = new Map<string, Row[]>()

  for (const [table, definition] of Object.entries(REPLICA_TABLES)) {
    const rows: Row[] = []

    for (let offset = 0; offset < 500_000; offset += PAGE_SIZE) {
      if (options.shouldAbort()) return false

      const url =
        `${config.baseUrl}/rest/v1/${table}?select=*` +
        `&${definition.owner}=eq.${encodeURIComponent(options.userId)}` +
        `&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`

      const response = await fetchPage(url, config.apiKey, token)

      // Table absente de ce projet : on la considère vide plutôt que de bloquer toute la copie.
      if (response.status === 404) break
      if (!response.ok) return false

      const page = (await response.json()) as Row[]
      rows.push(...page)
      if (page.length < PAGE_SIZE) break
    }

    fetched.set(table, rows)
  }

  // Une modification a pu être faite pendant la copie : ces données seraient déjà périmées.
  if (options.shouldAbort()) return false

  await loadUser(options.userId)
  const syncedAt = Date.now()

  for (const [table, rows] of fetched) {
    const record: ReplicaRecord = {
      key: recordKey(options.userId, table),
      userId: options.userId,
      table,
      rows,
      syncedAt
    }
    tables.set(record.key, record)
    await persist(record)
  }

  return true
}

/** Copie toutes les données de l'enseignant sur l'appareil. Une seule copie à la fois. */
export function syncReplica(options: ReplicaSyncOptions): Promise<boolean> {
  if (syncPromise) return syncPromise

  syncing = true
  emit()

  syncPromise = runSync(options)
    .catch((error) => {
      console.warn('[Replica] Copie des données interrompue :', error)
      return false
    })
    .finally(() => {
      syncing = false
      syncPromise = null
      emit()
    })

  return syncPromise
}

/** Efface la copie locale (à la déconnexion : les données appartiennent à l'enseignant qui part). */
export async function clearReplica(): Promise<void> {
  tables.clear()
  loaded.clear()
  loading.clear()

  try {
    await dbClear('replica')
  } catch (error) {
    console.warn('[Replica] Impossible de vider la copie locale :', error)
  }
  emit()
}
