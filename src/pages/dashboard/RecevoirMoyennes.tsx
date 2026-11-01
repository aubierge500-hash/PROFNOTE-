import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Inbox } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { loadClasses, type ClassRow, type SupabaseLike } from '@/features/bulletin/bulletin.data'

const db = supabase as unknown as SupabaseLike

interface ClassSummary {
  schoolClass: ClassRow
  hasCode: boolean
  received: number
}

/**
 * Entrée « Recevoir des moyennes » du menu : le professeur principal choisit sa classe,
 * puis arrive sur l'écran des moyennes générales (code de partage et envois reçus).
 */
export default function RecevoirMoyennes() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ClassSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError('')
      try {
        const classes = await loadClasses(db)
        const [codes, received] = await Promise.all([
          db.from('pp_share_codes').select('class_id').eq('active', true),
          db.from('pp_received').select('class_id')
        ])
        // Si le partage n'est pas encore installé côté base, on affiche quand même les classes.
        const codeRows = ((codes.error ? [] : codes.data) as { class_id: string }[] | null) ?? []
        const codeIds = new Set(codeRows.map((r) => r.class_id))
        const counts = new Map<string, number>()
        const receivedRows =
          ((received.error ? [] : received.data) as { class_id: string }[] | null) ?? []
        for (const r of receivedRows) {
          counts.set(r.class_id, (counts.get(r.class_id) ?? 0) + 1)
        }
        setItems(
          classes.map((c) => ({
            schoolClass: c,
            hasCode: codeIds.has(c.id),
            received: counts.get(c.id) ?? 0
          }))
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Chargement impossible.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-primary-800">Recevoir des moyennes</h1>
        <p className="text-xs text-primary-500">
          Professeur principal : choisis ta classe pour créer le code de partage, voir les moyennes
          envoyées par tes collègues et les intégrer.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-primary-500">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="card text-sm text-primary-500">
          Tu n'as pas encore de classe. Crée ta classe dans « Classes », puis reviens ici.
        </div>
      ) : (
        <div className="grid gap-2">
          {items.map(({ schoolClass, hasCode, received }) => (
            <button
              key={schoolClass.id}
              type="button"
              onClick={() => navigate(`/classes/${schoolClass.id}/moyennes-generales`)}
              className="card flex items-center justify-between gap-3 text-left"
            >
              <div className="flex items-center gap-3">
                <Inbox size={20} className="text-primary-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-primary-800">{schoolClass.name}</p>
                  <p className="text-xs text-primary-500">
                    {schoolClass.school_year} ·{' '}
                    {hasCode ? 'code actif' : 'pas de code'} ·{' '}
                    {received === 0
                      ? 'aucun envoi reçu'
                      : `${received} envoi${received > 1 ? 's' : ''} reçu${received > 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <ChevronRight size={18} className="text-primary-400 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
