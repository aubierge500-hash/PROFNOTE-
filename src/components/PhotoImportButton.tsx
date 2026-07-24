import { useState, useRef, type ChangeEvent } from 'react'
import { Camera, Image as ImageIcon, Loader2, Trash2, Plus } from 'lucide-react'
import { insertImportedStudents, type ImportedRow } from '@/lib/studentImport'
import { getOcrProvider } from '@/lib/ocr'

interface Props {
  classId: string
  teacherId: string
  className: string
  onImported: () => void
}

interface EditableRow {
  last_name: string
  first_name: string
}

function parseOcrText(text: string): EditableRow[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && /[a-zA-Z\u00c0-\u00ff]/.test(l))

  return lines.map((line) => {
    const cleaned = line.replace(/^\d+[.\-)]\s*/, '')
    const parts = cleaned.split(/\s{2,}|,|\t/).map((p) => p.trim()).filter(Boolean)

    if (parts.length >= 2) {
      return { last_name: parts[0], first_name: parts.slice(1).join(' ') }
    }
    const words = cleaned.split(' ').filter(Boolean)
    if (words.length >= 2) {
      return { last_name: words[0], first_name: words.slice(1).join(' ') }
    }
    return { last_name: cleaned, first_name: '' }
  })
}

export default function PhotoImportButton({ classId, teacherId, className, onImported }: Props) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [rows, setRows] = useState<EditableRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setProcessing(true)
    setProgress(0)
    setRows(null)

    try {
      const provider = getOcrProvider('printed')
      const result = await provider.recognize(file, (p) => setProgress(p))
      const parsed = parseOcrText(result.text)
      if (parsed.length === 0) {
        setError("Aucun texte reconnu sur cette photo. Réessaie avec un meilleur éclairage ou un cadrage plus net.")
      } else {
        setRows(parsed)
      }
    } catch (err) {
      console.error('[OCR] Erreur de reconnaissance :', err)
      setError("Erreur lors de l'analyse de la photo. Réessaie.")
    } finally {
      setProcessing(false)
    }
  }

  function updateRow(index: number, field: keyof EditableRow, value: string) {
    if (!rows) return
    const next = [...rows]
    next[index] = { ...next[index], [field]: value }
    setRows(next)
  }

  function removeRow(index: number) {
    if (!rows) return
    setRows(rows.filter((_, i) => i !== index))
  }

  function addRow() {
    setRows((r) => [...(r ?? []), { last_name: '', first_name: '' }])
  }

  async function handleConfirmImport() {
    if (!rows) return
    const validRows: ImportedRow[] = rows
      .filter((r) => r.last_name.trim())
      .map((r) => ({ Nom: r.last_name, Prenom: r.first_name }))

    if (validRows.length === 0) {
      setError("Ajoute au moins un nom valide avant d'importer.")
      return
    }

    setImporting(true)
    try {
      await insertImportedStudents(validRows, teacherId, classId)
      setRows(null)
      onImported()
    } catch (err) {
      console.error("[Import photo] Erreur d'insertion :", err)
      setError("Erreur lors de l'enregistrement des élèves. Réessaie.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <button
          onClick={() => cameraInputRef.current?.click()}
          disabled={processing}
          className="btn-secondary flex items-center gap-1.5 text-sm"
        >
          <Camera size={16} /> Photo
        </button>
        <button
          onClick={() => galleryInputRef.current?.click()}
          disabled={processing}
          className="btn-secondary flex items-center gap-1.5 text-sm"
        >
          <ImageIcon size={16} /> Galerie
        </button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {processing && (
        <div className="card mt-3 flex items-center gap-2 text-sm text-primary-600">
          <Loader2 size={16} className="animate-spin" />
          Analyse de la photo… {progress > 0 ? `${progress}%` : ''}
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {rows && (
        <div className="card mt-3 space-y-3">
          <p className="text-sm font-medium text-primary-700">
            {rows.length} ligne(s) détectée(s) — vérifie et corrige avant d'importer dans « {className} »
          </p>
          <div className="max-h-64 overflow-auto space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className="input-field text-sm flex-1"
                  placeholder="Nom"
                  value={r.last_name}
                  onChange={(e) => updateRow(i, 'last_name', e.target.value)}
                />
                <input
                  className="input-field text-sm flex-1"
                  placeholder="Prénom"
                  value={r.first_name}
                  onChange={(e) => updateRow(i, 'first_name', e.target.value)}
                />
                <button onClick={() => removeRow(i)} className="p-2 text-danger hover:bg-red-50 rounded-lg shrink-0">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addRow} className="text-xs text-primary-600 flex items-center gap-1">
            <Plus size={14} /> Ajouter une ligne manuellement
          </button>
          <div className="flex gap-2 pt-2 border-t border-primary-100">
            <button onClick={handleConfirmImport} disabled={importing} className="btn-primary text-sm">
              {importing ? 'Import en cours…' : `Importer ${rows.filter((r) => r.last_name.trim()).length} élève(s)`}
            </button>
            <button onClick={() => setRows(null)} className="btn-secondary text-sm">Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}
