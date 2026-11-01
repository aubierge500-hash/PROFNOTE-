import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, MessageCircle, RefreshCw, Share2, Trash2, X } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import type { SupabaseLike } from '@/features/bulletin/bulletin.data'
import { fmt } from '@/features/bulletin/bulletin.compute'
import type { PPStudent } from '@/features/pp/pp.compute'
import { savePPRow, type PPStoredRow } from '@/features/pp/pp.data'
import {
  buildShareWhatsAppUrl,
  createShareCode,
  deleteReceived,
  disableShareCode,
  formatShareCode,
  getActiveShareCode,
  isSameAsExisting,
  loadReceived,
  readableShareError,
  type ReceivedRow
} from '@/features/pp/pp.share'

const db = supabase as unknown as SupabaseLike

interface Props {
  classId: string
  className: string
  period: number
  periodLabel: string
  students: PPStudent[]
  /** Lignes déjà saisies par le PP (toutes périodes) */
  rows: PPStoredRow[]
  onIntegrated: (row: PPStoredRow) => void
}

function formatDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) +
        ' ' +
        d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export default function PPPartage({
  classId,
  className,
  period,
  periodLabel,
  students,
  rows,
  onIntegrated
}: Props) {
  const { user } = useAuth()
  const [code, setCode] = useState<string | null>(null)
  const [received, setReceived] = useState<ReceivedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [active, list] = await Promise.all([
        getActiveShareCode(db, classId),
        loadReceived(db, classId)
      ])
      setCode(active?.code ?? null)
      setReceived(list)
    } catch (e) {
      setError(
        readableShareError(
          e instanceof Error ? e.message : undefined,
          'Impossible de charger le partage. Vérifie ta connexion puis réessaie.'
        )
      )
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    void load()
  }, [load])

  const studentIds = useMemo(() => new Set(students.map((s) => s.id)), [students])

  const periodReceived = useMemo(
    () =>
      received
        .filter((r) => r.period === period)
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
    [received, period]
  )

  async function handleCreate() {
    if (code && !window.confirm('Créer un nouveau code ? L\'ancien code ne fonctionnera plus.')) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      setCode(await createShareCode(db, classId))
    } catch (e) {
      setError(
        readableShareError(e instanceof Error ? e.message : undefined, 'Création du code impossible.')
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    if (!window.confirm('Désactiver le code ? Plus aucun collègue ne pourra envoyer de moyennes.')) return
    setBusy(true)
    setError('')
    try {
      await disableShareCode(db, classId)
      setCode(null)
      setMessage('Code désactivé.')
    } catch (e) {
      setError(
        readableShareError(e instanceof Error ? e.message : undefined, 'Désactivation impossible.')
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(formatShareCode(code))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copie impossible : recopie le code à la main.')
    }
  }

  async function handleIntegrate(item: ReceivedRow) {
    if (!user) return
    const existing = rows.find(
      (r) => r.period === item.period && r.subjectKey === item.subjectKey
    )
    const sameKind = existing && existing.kind !== 'matiere'
    if (sameKind) {
      setError(`« ${item.subjectName} » est déjà une ligne spéciale de ta classe.`)
      return
    }
    if (
      existing &&
      !isSameAsExisting(item, existing) &&
      !window.confirm(
        `« ${item.subjectName} » existe déjà pour cette période. Remplacer tes valeurs par celles reçues ?`
      )
    ) {
      return
    }

    // On ne garde que les élèves encore présents dans la classe.
    const averages: Record<string, number> = {}
    for (const [studentId, value] of Object.entries(item.averages)) {
      if (studentIds.has(studentId) && typeof value === 'number') averages[studentId] = value
    }

    const row: PPStoredRow = {
      period: item.period,
      subjectKey: item.subjectKey,
      kind: 'matiere',
      subjectName: item.subjectName,
      coef: item.coef,
      teacherName: item.teacherName,
      averages
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await savePPRow(db, user.id, classId, row)
      onIntegrated(row)
      setMessage(`« ${item.subjectName} » intégrée à tes moyennes.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'intégration a échoué.")
    } finally {
      setBusy(false)
    }
  }

  async function handleIgnore(item: ReceivedRow) {
    if (!window.confirm(`Supprimer l'envoi « ${item.subjectName} » reçu ?`)) return
    try {
      await deleteReceived(db, classId, item)
      setReceived((list) =>
        list.filter(
          (r) =>
            !(
              r.period === item.period &&
              r.senderId === item.senderId &&
              r.subjectKey === item.subjectKey
            )
        )
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La suppression a échoué.')
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-2">
        <Share2 size={18} className="text-primary-500" />
        <div>
          <h2 className="font-semibold text-primary-800">Recevoir les moyennes de mes collègues</h2>
          <p className="text-xs text-primary-500">
            Envoie ce code à chaque professeur : il t'envoie sa moyenne et son coefficient depuis son
            compte PROFNOTE.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {message}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-primary-500">Chargement…</p>
      ) : (
        <>
          {code ? (
            <div className="rounded-xl bg-primary-50 p-3 space-y-3">
              <p className="text-xs text-primary-500">Code de la {className}</p>
              <p className="text-2xl font-bold tracking-widest text-primary-800">
                {formatShareCode(code)}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="btn-secondary flex items-center gap-1 text-sm"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copié' : 'Copier'}
                </button>
                <a
                  href={buildShareWhatsAppUrl(className, code, window.location.origin)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary flex items-center gap-1 text-sm"
                >
                  <MessageCircle size={16} />
                  Envoyer sur WhatsApp
                </a>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCreate()}
                  className="btn-secondary flex items-center gap-1 text-sm"
                >
                  <RefreshCw size={16} />
                  Nouveau code
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDisable()}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700"
                >
                  Désactiver
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-primary-500">
                Aucun code actif pour cette classe. Les collègues ne peuvent pas t'envoyer de moyennes.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCreate()}
                className="btn-primary text-sm"
              >
                {busy ? 'Création…' : 'Créer un code de partage'}
              </button>
            </div>
          )}

          <div className="border-t border-primary-100 pt-3 space-y-2">
            <h3 className="font-medium text-primary-800">Envois reçus · {periodLabel}</h3>
            {periodReceived.length === 0 ? (
              <p className="text-sm text-primary-500">Aucun envoi reçu pour cette période.</p>
            ) : (
              periodReceived.map((item) => {
                const existing = rows.find(
                  (r) => r.period === item.period && r.subjectKey === item.subjectKey
                )
                const upToDate = isSameAsExisting(item, existing)
                const noted = Object.keys(item.averages).filter((id) => studentIds.has(id)).length
                return (
                  <div
                    key={`${item.senderId}:${item.subjectKey}`}
                    className="rounded-xl border border-primary-100 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-primary-800">
                          {item.subjectName} · coef {fmt(item.coef).replace(',00', '')}
                        </p>
                        <p className="text-xs text-primary-500">
                          {item.teacherName ? `${item.teacherName} · ` : ''}
                          {noted}/{students.length} moyennes · reçu le {formatDate(item.updatedAt)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          upToDate
                            ? 'bg-green-50 text-green-700'
                            : existing
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {upToDate ? 'Intégré' : existing ? 'Mise à jour' : 'Nouveau'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {!upToDate && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleIntegrate(item)}
                          className="btn-primary text-sm"
                        >
                          {existing ? 'Mettre à jour mes moyennes' : 'Intégrer à mes moyennes'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleIgnore(item)}
                        className="text-red-600 p-2"
                        aria-label={`Supprimer l'envoi ${item.subjectName}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </section>
  )
}
