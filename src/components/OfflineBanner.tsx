import { useCallback, useEffect, useState } from 'react'
import {
  discardFailedChanges,
  getSyncSnapshot,
  listFailedChanges,
  retryFailedChanges,
  subscribeSync,
  syncNow,
  type SyncSnapshot
} from '@/lib/offlineSync'
import { describeEntry, type FailedEntry } from '@/lib/offlineOutbox'

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`
}

/** Bandeau d'état du mode hors ligne : réseau, modifications en attente, modifications refusées. */
export default function OfflineBanner() {
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(() => getSyncSnapshot())
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine)
  const [failedEntries, setFailedEntries] = useState<FailedEntry[]>([])
  const [showDetails, setShowDetails] = useState(false)

  const refresh = useCallback(() => {
    setSnapshot(getSyncSnapshot())
  }, [])

  useEffect(() => {
    const goOnline = () => setBrowserOnline(true)
    const goOffline = () => setBrowserOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    const unsubscribe = subscribeSync(refresh)
    refresh()

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      unsubscribe()
    }
  }, [refresh])

  useEffect(() => {
    if (!showDetails || snapshot.failed === 0) {
      setFailedEntries([])
      return
    }

    let cancelled = false
    void listFailedChanges().then((entries) => {
      if (!cancelled) setFailedEntries(entries)
    })

    return () => {
      cancelled = true
    }
  }, [showDetails, snapshot.failed])

  const offline = !browserOnline || !snapshot.online

  if (snapshot.failed > 0) {
    return (
      <div role="alert" className="bg-red-600 px-3 py-2 text-xs text-white sm:text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">
            {plural(snapshot.failed, 'modification n’a', 'modifications n’ont')} pas pu être
            enregistrée{snapshot.failed > 1 ? 's' : ''} sur le serveur.
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              className="rounded bg-white/20 px-2 py-1 hover:bg-white/30"
              onClick={() => setShowDetails((value) => !value)}
            >
              {showDetails ? 'Masquer' : 'Détails'}
            </button>
            <button
              type="button"
              className="rounded bg-white/20 px-2 py-1 hover:bg-white/30"
              onClick={() => void retryFailedChanges()}
            >
              Réessayer
            </button>
            <button
              type="button"
              className="rounded bg-white/20 px-2 py-1 hover:bg-white/30"
              onClick={() => {
                if (confirm('Abandonner définitivement ces modifications ?')) {
                  void discardFailedChanges()
                }
              }}
            >
              Abandonner
            </button>
          </span>
        </div>

        {showDetails && (
          <ul className="mt-2 space-y-1">
            {failedEntries.map((entry) => (
              <li key={entry.seq} className="rounded bg-black/20 px-2 py-1">
                <span className="font-medium">{describeEntry(entry)}</span> — {entry.error}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  if (offline) {
    return (
      <div
        role="status"
        className="bg-amber-500 px-3 py-1.5 text-center text-xs font-medium text-white sm:text-sm"
      >
        Mode hors ligne : vous pouvez continuer à travailler.
        {snapshot.pending > 0
          ? ` ${plural(snapshot.pending, 'modification sera envoyée', 'modifications seront envoyées')} au retour d’internet.`
          : ' Vos modifications seront envoyées au retour d’internet.'}
      </div>
    )
  }

  if (snapshot.pending > 0) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center justify-center gap-2 bg-blue-600 px-3 py-1.5 text-xs text-white sm:text-sm"
      >
        <span>
          Envoi de {plural(snapshot.pending, 'modification', 'modifications')} en cours…
        </span>
        <button
          type="button"
          className="rounded bg-white/20 px-2 py-0.5 hover:bg-white/30"
          onClick={() => void syncNow()}
        >
          Envoyer maintenant
        </button>
      </div>
    )
  }

  if (snapshot.justSynced) {
    return (
      <div
        role="status"
        className="bg-green-600 px-3 py-1.5 text-center text-xs font-medium text-white sm:text-sm"
      >
        ✓ Modifications envoyées
      </div>
    )
  }

  if (snapshot.replicaSyncing) {
    return (
      <div
        role="status"
        className="bg-slate-600 px-3 py-1 text-center text-xs text-white"
      >
        Préparation du mode hors ligne…
      </div>
    )
  }

  return null
}
