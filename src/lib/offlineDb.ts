/**
 * Stockage local (IndexedDB) du mode hors ligne.
 *
 * Quatre magasins dans une même base :
 *  - responses : copie des dernières réponses de lecture (cache « page visitée »)
 *  - replica   : copie complète des données de l'enseignant (une entrée par table)
 *  - outbox    : modifications faites sans internet, en attente d'envoi (ordre conservé)
 *  - failed    : modifications refusées par le serveur, à relire par l'enseignant
 *
 * Si IndexedDB est indisponible (navigation privée, stockage bloqué), tout fonctionne en
 * mémoire : l'application reste utilisable, mais rien ne survit à un rechargement.
 */

const DB_NAME = 'profnote-http-cache'
const DB_VERSION = 2

export type StoreName = 'responses' | 'outbox' | 'failed' | 'replica'

type Stored = Record<string, unknown>

const memory: Record<StoreName, Map<string | number, Stored>> = {
  responses: new Map(),
  outbox: new Map(),
  failed: new Map(),
  replica: new Map()
}

const KEY_PATH: Record<StoreName, string> = {
  responses: 'key',
  outbox: 'seq',
  failed: 'seq',
  replica: 'key'
}

let memorySeq = 0
let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result

        if (!db.objectStoreNames.contains('responses')) {
          const store = db.createObjectStore('responses', { keyPath: 'key' })
          store.createIndex('savedAt', 'savedAt')
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
        }
        if (!db.objectStoreNames.contains('failed')) {
          db.createObjectStore('failed', { keyPath: 'seq' })
        }
        if (!db.objectStoreNames.contains('replica')) {
          db.createObjectStore('replica', { keyPath: 'key' })
        }
      }

      request.onsuccess = () => {
        const db = request.result
        // Une autre version de l'application demande une mise à jour : on libère la base.
        db.onversionchange = () => {
          db.close()
          dbPromise = null
        }
        resolve(db)
      }

      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })

  return dbPromise
}

function run<T>(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode,
  work: (objectStore: IDBObjectStore) => IDBRequest
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction
    let request: IDBRequest

    try {
      tx = db.transaction(store, mode)
      request = work(tx.objectStore(store))
    } catch (error) {
      reject(error)
      return
    }

    tx.oncomplete = () => resolve(request.result as T)
    tx.onerror = () => reject(tx.error ?? request.error)
    tx.onabort = () => reject(tx.error ?? new Error('Opération locale annulée.'))
  })
}

async function withDb<T>(idbWork: (db: IDBDatabase) => Promise<T>, memoryWork: () => T): Promise<T> {
  const db = await openDb()
  if (!db) return memoryWork()

  try {
    return await idbWork(db)
  } catch (error) {
    // Connexion fermée entre-temps (mise à jour de la base) : on rouvre une fois.
    if ((error as { name?: string } | null)?.name === 'InvalidStateError') {
      dbPromise = null
      const retry = await openDb()
      if (retry) return idbWork(retry)
      return memoryWork()
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function dbPut(store: StoreName, value: object): Promise<void> {
  await withDb(
    (db) => run<unknown>(db, store, 'readwrite', (s) => s.put(value)),
    () => {
      const record = value as Stored
      memory[store].set(record[KEY_PATH[store]] as string | number, record)
    }
  )
}

/** Ajoute un enregistrement dans un magasin à numérotation automatique (outbox) et renvoie son numéro. */
export async function dbAdd(store: 'outbox', value: object): Promise<number> {
  return withDb(
    (db) => run<number>(db, store, 'readwrite', (s) => s.add(value)),
    () => {
      memorySeq += 1
      memory[store].set(memorySeq, { ...(value as Stored), seq: memorySeq })
      return memorySeq
    }
  )
}

export async function dbGet<T>(store: StoreName, key: string | number): Promise<T | undefined> {
  return withDb(
    (db) => run<T | undefined>(db, store, 'readonly', (s) => s.get(key)),
    () => memory[store].get(key) as T | undefined
  )
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  return withDb(
    (db) => run<T[]>(db, store, 'readonly', (s) => s.getAll()),
    () => Array.from(memory[store].values()) as T[]
  )
}

export async function dbDelete(store: StoreName, key: string | number): Promise<void> {
  await withDb(
    (db) => run<unknown>(db, store, 'readwrite', (s) => s.delete(key)),
    () => {
      memory[store].delete(key)
    }
  )
}

export async function dbClear(store: StoreName): Promise<void> {
  await withDb(
    (db) => run<unknown>(db, store, 'readwrite', (s) => s.clear()),
    () => {
      memory[store].clear()
    }
  )
}

export async function dbCount(store: StoreName): Promise<number> {
  return withDb(
    (db) => run<number>(db, store, 'readonly', (s) => s.count()),
    () => memory[store].size
  )
}

/** Supprime les copies de lecture plus anciennes que la date donnée. */
export async function dbPruneResponses(before: number): Promise<void> {
  const all = await dbGetAll<{ key: string; savedAt: number }>('responses')
  const old = all.filter((entry) => entry.savedAt < before)

  for (const entry of old) {
    await dbDelete('responses', entry.key)
  }
}
