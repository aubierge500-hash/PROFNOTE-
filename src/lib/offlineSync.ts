/**
 * Chef d'orchestre du mode hors ligne.
 *
 * - Envoie les modifications en attente dès que le réseau revient (et régulièrement).
 * - Garde la copie locale des données à jour (au premier lancement, puis toutes les
 *   quelques heures, et après chaque envoi réussi).
 * - Fournit l'état affiché dans le bandeau (modifications en attente, refusées, etc.).
 */

import {
  getOfflineConfig,
  isNavigatorOffline,
  isNetworkLikelyDown,
  markNetworkUp,
  subscribeNetwork,
  userIdFromToken
} from './offlineNetwork'
import {
  discardFailed,
  ensureOutboxLoaded,
  flushOutbox,
  getFailedCount,
  getPendingCount,
  isFlushing,
  listFailed,
  requeueFailed,
  subscribeOutbox,
  type FailedEntry
} from './offlineOutbox'
import { getReplicaStatus, isReplicaSyncing, subscribeReplica, syncReplica } from './offlineReplica'

/** La copie locale est rafraîchie si elle a plus de 3 heures. */
const REPLICA_MAX_AGE_MS = 3 * 60 * 60 * 1000
const TICK_MS = 30_000
const JUST_SYNCED_MS = 4000

export interface SyncSnapshot {
  online: boolean
  pending: number
  failed: number
  flushing: boolean
  replicaSyncing: boolean
  justSynced: boolean
}

let started = false
let running: Promise<void> | null = null
let lastUserId: string | null = null
let justSynced = false
let justSyncedTimer: ReturnType<typeof setTimeout> | undefined
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

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSyncSnapshot(): SyncSnapshot {
  return {
    online: !isNetworkLikelyDown(),
    pending: getPendingCount(),
    failed: getFailedCount(),
    flushing: isFlushing(),
    replicaSyncing: isReplicaSyncing(),
    justSynced
  }
}

function flashSynced(): void {
  justSynced = true
  emit()
  if (justSyncedTimer) clearTimeout(justSyncedTimer)
  justSyncedTimer = setTimeout(() => {
    justSynced = false
    emit()
  }, JUST_SYNCED_MS)
}

async function currentUserId(): Promise<string | null> {
  if (lastUserId) return lastUserId

  const config = getOfflineConfig()
  if (!config) return null

  try {
    lastUserId = userIdFromToken(await config.getAccessToken())
  } catch {
    lastUserId = null
  }
  return lastUserId
}

async function refreshReplica(force: boolean): Promise<void> {
  const userId = await currentUserId()
  if (!userId) return

  const status = await getReplicaStatus(userId)
  const stale = !status.ready || Date.now() - (status.syncedAt ?? 0) > REPLICA_MAX_AGE_MS
  if (!force && !stale) return

  await syncReplica({
    userId,
    shouldAbort: () => getPendingCount() > 0 || isNavigatorOffline()
  })
}

/** Envoie les modifications en attente, puis rafraîchit la copie des données si nécessaire. */
export function syncNow(): Promise<void> {
  if (running) return running

  running = (async () => {
    try {
      await ensureOutboxLoaded()
      if (isNavigatorOffline()) return

      const result = await flushOutbox()
      if (result.sent > 0) flashSynced()

      if (getPendingCount() === 0 && !isNavigatorOffline()) {
        // Après un envoi, on récupère l'état exact du serveur ; sinon seulement si la copie est ancienne.
        await refreshReplica(result.sent > 0)
      }
    } catch (error) {
      console.warn('[Sync] Synchronisation interrompue :', error)
    } finally {
      running = null
      emit()
    }
  })()

  return running
}

/** Lance la synchronisation automatique (une seule fois). */
export function startOfflineSync(): void {
  if (started || typeof window === 'undefined') return
  started = true

  subscribeOutbox(emit)
  subscribeReplica(emit)
  subscribeNetwork(emit)

  window.addEventListener('online', () => {
    markNetworkUp()
    void syncNow()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })

  window.setInterval(() => {
    if (!isNavigatorOffline()) void syncNow()
  }, TICK_MS)

  // Premier passage peu après l'ouverture, une fois la session rétablie.
  window.setTimeout(() => {
    void syncNow()
  }, 2500)
}

/** À appeler quand l'utilisateur change (connexion / déconnexion). */
export function resetSyncUser(): void {
  lastUserId = null
  emit()
}

// ---------------------------------------------------------------------------
// Actions proposées dans le bandeau
// ---------------------------------------------------------------------------

export async function listFailedChanges(): Promise<FailedEntry[]> {
  return listFailed()
}

export async function discardFailedChanges(): Promise<void> {
  await discardFailed()
  emit()
}

export async function retryFailedChanges(): Promise<void> {
  await requeueFailed()
  await syncNow()
}

/** Force la mise à jour de la copie locale (bouton « Actualiser les données hors ligne »). */
export async function refreshOfflineData(): Promise<boolean> {
  const userId = await currentUserId()
  if (!userId || isNavigatorOffline()) return false

  await flushOutbox()
  if (getPendingCount() > 0) return false

  return syncReplica({ userId, shouldAbort: () => getPendingCount() > 0 || isNavigatorOffline() })
}
