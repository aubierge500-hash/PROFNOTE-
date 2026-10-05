import { useEffect, useState, type ChangeEvent } from 'react'
import {
  Plus,
  Upload,
  Trash2,
  ChevronRight,
  ClipboardPaste,
  X
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  insertImportedStudents,
  type ImportedRow
} from '@/lib/studentImport'
import {
  parseStudentsFile,
  type ImportResult
} from '@/lib/importStudentsFile'
import PhotoImportButton from '@/components/PhotoImportButton'
import type { SchoolClass, Student } from '@/types/database'

function normalizeBeninWhatsApp(
  value?: string
): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')

  if (!digits) return null

  let local = digits.startsWith('229')
    ? digits.slice(3)
    : digits

  if (local.length === 8) {
    local = `01${local}`
  }

  if (!/^01\d{8}$/.test(local)) {
    return null
  }

  return `+229${local}`
}

function isValidWhatsApp(value?: string): boolean {
  if (!value?.trim()) return true
  return normalizeBeninWhatsApp(value) !== null
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeGender(value: string): string {
  const normalized = normalizeHeader(value)

  if (
    normalized === 'f' ||
    normalized === 'feminin' ||
    normalized === 'fille' ||
    normalized === 'female'
  ) {
    return 'F'
  }

  if (
    normalized === 'm' ||
    normalized === 'masculin' ||
    normalized === 'garcon' ||
    normalized === 'male'
  ) {
    return 'M'
  }

  return ''
}

function isWhatsAppValue(value: string): boolean {
  const digits = value.replace(/\D/g, '')

  if (!digits) return false

  if (digits.startsWith('229')) {
    return digits.length === 11
  }

  return digits.length === 8 || digits.length === 10
}

function isHeaderLine(line: string): boolean {
  const normalized = normalizeHeader(line)

  if (!normalized) return false

  return (
    normalized.includes('nomprenom') ||
    normalized.includes('prenomnom') ||
    normalized.includes('nom') &&
      normalized.includes('prenom') ||
      normalized.includes('nom') &&
      normalized.includes('sexe') ||
      normalized.includes('nom') &&
      normalized.includes('whatsapp') ||
      normalized.includes('listeeleves') ||
      normalized.includes('listedeclasse') ||
      normalized === 'eleves' ||
      normalized === 'eleve'
  )
}

function splitPastedLine(line: string): string[] {
  const value = line
    .replace(/\u00a0/g, ' ')
    .trim()

  if (!value) return []

  if (value.includes('\t')) {
    return value
      .split(/\t+/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (value.includes(';')) {
    return value
      .split(/;/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (value.includes('|')) {
    return value
      .split(/\|/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (value.includes(',')) {
    return value
      .split(/,/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function removeRowNumber(columns: string[]): string[] {
  if (columns.length === 0) return columns

  const first = columns[0].replace(/[.)-]+$/, '')

  if (/^\d+$/.test(first)) {
    return columns.slice(1)
  }

  return columns
}

function parsePastedStudentsText(
  text: string
): ImportedRow[] {
  const rows: ImportedRow[] = []

  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  for (const rawLine of lines) {
    const line = rawLine
      .replace(/\u00a0/g, ' ')
      .trim()

    if (!line) continue

    if (isHeaderLine(line)) {
      continue
    }

    let columns = splitPastedLine(line)

    if (columns.length === 0) continue

    columns = removeRowNumber(columns)

    if (columns.length < 2) {
      continue
    }

    let gender = ''
    let whatsapp = ''

    const remaining: string[] = []

    for (const column of columns) {
      const value = column.trim()

      if (!value) continue

      const detectedGender = normalizeGender(value)

      if (!gender && detectedGender) {
        gender = detectedGender
        continue
      }

      if (!whatsapp && isWhatsAppValue(value)) {
        whatsapp = value
        continue
      }

      remaining.push(value)
    }

    if (remaining.length < 2) {
      continue
    }

    const lastName = remaining[0].trim()
    const firstName = remaining
      .slice(1)
      .join(' ')
      .trim()

    if (!lastName || !firstName) {
      continue
    }

    rows.push({
      Nom: lastName,
      Prenom: firstName,
      Sexe: gender,
      WhatsApp: whatsapp
    })
  }

  const seen = new Set<string>()

  return rows.filter((row) => {
    const key = normalizeHeader(
      `${row.Nom} ${row.Prenom}`
    )

    if (!key || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export default function Students() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [showPasteImport, setShowPasteImport] = useState(false)

  const [form, setForm] = useState({
    last_name: '',
    first_name: '',
    gender: '',
    parent_whatsapp: ''
  })

  const [pasteText, setPasteText] = useState('')
  const [pasteRows, setPasteRows] = useState<ImportedRow[]>([])
  const [pasteError, setPasteError] = useState('')
  const [pasteImporting, setPasteImporting] = useState(false)

  const [importResult, setImportResult] =
    useState<ImportResult | null>(null)

  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (user) void init()
  }, [user])

  useEffect(() => {
    if (user) void loadStudents()
  }, [user, selectedClass])

  async function init() {
    const { data } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', user!.id)
      .eq('is_archived', false)
      .order('name')

    setClasses((data as SchoolClass[]) ?? [])

    if (data && data.length > 0) {
      setSelectedClass((data[0] as SchoolClass).id)
    }
  }

  async function loadStudents() {
    setLoading(true)

    let query = supabase
      .from('students')
      .select('*')
      .eq('teacher_id', user!.id)
      .eq('is_active', true)
      .order('last_name')

    if (selectedClass) {
      query = query.eq('class_id', selectedClass)
    }

    const { data } = await query

    setStudents((data as Student[]) ?? [])
    setLoading(false)
  }

  async function handleAddManual() {
    if (!form.last_name.trim() || !selectedClass) return

    if (
      form.parent_whatsapp.trim() &&
      !isValidWhatsApp(form.parent_whatsapp)
    ) {
      return
    }

    const normalizedWhatsApp =
      normalizeBeninWhatsApp(form.parent_whatsapp)

    const { error } = await supabase
      .from('students')
      .insert({
        teacher_id: user!.id,
        class_id: selectedClass,
        last_name: form.last_name.trim(),
        first_name: form.first_name.trim(),
        gender: form.gender || null,
        parent_whatsapp: normalizedWhatsApp,
        is_active: true
      })

    if (error) {
      setImportError(error.message)
      return
    }

    setForm({
      last_name: '',
      first_name: '',
      gender: '',
      parent_whatsapp: ''
    })

    setShowForm(false)
    void loadStudents()
  }

  async function handleDelete(s: Student) {
    if (
      !confirm(
        `Retirer ${s.first_name} ${s.last_name} de la classe ?`
      )
    ) {
      return
    }

    await supabase
      .from('students')
      .update({ is_active: false })
      .eq('id', s.id)

    void loadStudents()
  }

  function previewPastedStudents() {
    setPasteError('')

    const rows = parsePastedStudentsText(pasteText)

    if (rows.length === 0) {
      setPasteRows([])
      setPasteError(
        'Aucun élève détecté. Collez au minimum le Nom et le Prénom de chaque élève.'
      )
      return
    }

    setPasteRows(rows)

    const invalidWhatsApp = rows.filter(
      (row) =>
        !!row.WhatsApp &&
        !isValidWhatsApp(row.WhatsApp)
    )

    if (invalidWhatsApp.length > 0) {
      setPasteError(
        `${invalidWhatsApp.length} numéro(s) WhatsApp invalide(s). Vérifiez la liste avant l'import.`
      )
    }
  }

  async function confirmPastedImport() {
    if (!user || !selectedClass || pasteRows.length === 0) {
      return
    }

    const invalidWhatsApp = pasteRows.filter(
      (row) =>
        !!row.WhatsApp &&
        !isValidWhatsApp(row.WhatsApp)
    )

    if (invalidWhatsApp.length > 0) {
      setPasteError(
        'Impossible d’importer : au moins un numéro WhatsApp est invalide.'
      )
      return
    }

    setPasteImporting(true)
    setPasteError('')

    try {
      await insertImportedStudents(
        pasteRows,
        user.id,
        selectedClass
      )

      setPasteText('')
      setPasteRows([])
      setShowPasteImport(false)

      await loadStudents()
    } catch (error) {
      setPasteError(
        error instanceof Error
          ? error.message
          : "L'import des élèves a échoué."
      )
    } finally {
      setPasteImporting(false)
    }
  }

  function closePasteImport() {
    if (pasteImporting) return

    setShowPasteImport(false)
    setPasteText('')
    setPasteRows([])
    setPasteError('')
  }

  async function handleFileSelect(
    e: ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0]

    e.target.value = ''

    if (!file) return

    setImportError('')
    setImportResult(null)

    try {
      const result = await parseStudentsFile(file)
      setImportResult(result)
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : 'Impossible de lire ce fichier.'
      )
    }
  }

  async function confirmImport() {
    if (!importResult || !selectedClass || !user) return

    const validRows = importResult.rows.filter(
      (row) =>
        row.Nom?.trim() &&
        row.Prenom?.trim()
    )

    if (validRows.length === 0) {
      setImportError(
        'Aucune ligne complète à importer : chaque élève doit avoir un Nom et un Prénom.'
      )
      return
    }

    const invalidWhatsApp = validRows.filter(
      (row) =>
        row.WhatsApp &&
        !isValidWhatsApp(row.WhatsApp)
    )

    if (invalidWhatsApp.length > 0) {
      setImportError(
        `${invalidWhatsApp.length} numéro(s) WhatsApp invalide(s). Corrigez-les avant de confirmer l'import.`
      )
      return
    }

    setImporting(true)
    setImportError('')

    try {
      await insertImportedStudents(
        validRows,
        user.id,
        selectedClass
      )

      setImportResult(null)
      await loadStudents()
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "L'import n'a pas pu être enregistré."
      )
    } finally {
      setImporting(false)
    }
  }

  const incompleteRows = importResult
    ? importResult.rows.filter(
        (row) =>
          !row.Nom?.trim() ||
          !row.Prenom?.trim()
      ).length
    : 0

  const invalidFileWhatsApp = importResult
    ? importResult.rows.filter(
        (row) =>
          row.WhatsApp &&
          !isValidWhatsApp(row.WhatsApp)
      ).length
    : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-primary-800">
          Élèves
        </h1>

        <div className="flex gap-2">
          <label className="relative btn-secondary flex items-center gap-1.5 text-sm cursor-pointer overflow-hidden">
            <Upload size={16} />
            Importer

            <input
              type="file"
              accept=".csv,.xlsx,.xls,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileSelect}
            />
          </label>

          <button
            onClick={() => {
              setShowForm(false)
              setShowPasteImport(false)
              setPasteError('')
              setPasteRows([])
              setPasteText('')
              setShowForm(true)
            }}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus size={16} />
            Ajouter
          </button>
        </div>
      </div>

      <select
        className="input-field max-w-xs"
        value={selectedClass}
        onChange={(e) =>
          setSelectedClass(e.target.value)
        }
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {selectedClass && (
        <PhotoImportButton
          classId={selectedClass}
          teacherId={user!.id}
          className={
            classes.find(
              (c) => c.id === selectedClass
            )?.name ?? ''
          }
          onImported={loadStudents}
        />
      )}

      {importError && (
        <div className="card border border-red-200 bg-red-50 text-sm text-red-700">
          {importError}
        </div>
      )}

      {showForm && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-primary-800">
              Ajouter des élèves
            </h2>

            <button
              onClick={() => setShowForm(false)}
              className="p-1 text-primary-500 hover:bg-primary-50 rounded"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setShowPasteImport(true)
                setShowForm(false)
              }}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <ClipboardPaste size={16} />
              Coller une liste
            </button>

            <button
              onClick={() => setShowForm(true)}
              className="btn-primary text-sm"
            >
              Ajouter un élève
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              className="input-field"
              placeholder="Nom"
              value={form.last_name}
              onChange={(e) =>
                setForm({
                  ...form,
                  last_name: e.target.value
                })
              }
            />

            <input
              className="input-field"
              placeholder="Prénom"
              value={form.first_name}
              onChange={(e) =>
                setForm({
                  ...form,
                  first_name: e.target.value
                })
              }
            />

            <select
              className="input-field"
              value={form.gender}
              onChange={(e) =>
                setForm({
                  ...form,
                  gender: e.target.value
                })
              }
            >
              <option value="">Sexe</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>

            <input
              className="input-field"
              placeholder="WhatsApp parent (+229...)"
              value={form.parent_whatsapp}
              onChange={(e) =>
                setForm({
                  ...form,
                  parent_whatsapp: e.target.value
                })
              }
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void handleAddManual()}
              className="btn-primary text-sm"
            >
              Enregistrer
            </button>

            <button
              onClick={() => setShowForm(false)}
              className="btn-secondary text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {showPasteImport && (
        <div className="card space-y-4 border-2 border-primary-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-primary-800">
                Importer plusieurs élèves
              </h2>

              <p className="text-xs text-primary-400 mt-1">
                Collez directement votre liste ci-dessous.
              </p>
            </div>

            <button
              onClick={closePasteImport}
              className="p-1 text-primary-500 hover:bg-primary-50 rounded"
              disabled={pasteImporting}
            >
              <X size={18} />
            </button>
          </div>

          <div className="rounded-lg bg-primary-50 p-3 text-xs text-primary-600">
            <p className="font-medium mb-1">
              Formats acceptés :
            </p>

            <p>
              Nom → Prénom
            </p>

            <p>
              Nom → Prénom → Sexe
            </p>

            <p>
              Nom → Prénom → Sexe → WhatsApp
            </p>

            <p className="mt-1">
              Exemple : AHOTON&nbsp;&nbsp;Grâce&nbsp;&nbsp;F&nbsp;&nbsp;97123456
            </p>

            <p className="mt-1">
              Le numéro peut être écrit avec ou sans +229.
            </p>

            <p className="mt-1">
              Vous pouvez copier directement depuis Excel,
              Word ou cette conversation.
            </p>
          </div>

          <textarea
            className="input-field min-h-48 resize-y font-mono text-sm"
            placeholder={`AHOTON\tGrâce\tF\t97123456
ADJOVI\tKévin\tM\t96123456
AGBOSSOU\tMariam\tF\t90123456`}
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value)
              setPasteRows([])
              setPasteError('')
            }}
            disabled={pasteImporting}
          />

          {pasteError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {pasteError}
            </div>
          )}

          {pasteRows.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-primary-700">
                {pasteRows.length} élève(s) détecté(s)
              </p>

              <div className="max-h-64 overflow-auto border border-primary-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-primary-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">
                        N°
                      </th>

                      <th className="text-left p-2">
                        Nom
                      </th>

                      <th className="text-left p-2">
                        Prénom
                      </th>

                      <th className="text-left p-2">
                        Sexe
                      </th>

                      <th className="text-left p-2">
                        WhatsApp
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {pasteRows.map((row, index) => (
                      <tr
                        key={index}
                        className="border-t border-primary-50"
                      >
                        <td className="p-2">
                          {index + 1}
                        </td>

                        <td className="p-2">
                          {row.Nom}
                        </td>

                        <td className="p-2">
                          {row.Prenom}
                        </td>

                        <td className="p-2">
                          {row.Sexe || '—'}
                        </td>

                        <td className="p-2">
                          {row.WhatsApp || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={previewPastedStudents}
              className="btn-secondary text-sm"
              disabled={
                pasteImporting ||
                !pasteText.trim()
              }
            >
              Vérifier la liste
            </button>

            <button
              onClick={() => void confirmPastedImport()}
              className="btn-primary text-sm disabled:opacity-50"
              disabled={
                pasteImporting ||
                pasteRows.length === 0 ||
                !selectedClass
              }
            >
              {pasteImporting
                ? 'Import en cours…'
                : `Importer ${pasteRows.length || ''} élève${
                    pasteRows.length > 1 ? 's' : ''
                  }`}
            </button>

            <button
              onClick={closePasteImport}
              className="btn-secondary text-sm"
              disabled={pasteImporting}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {importResult && (
        <div className="card space-y-3">
          <div>
            <p className="text-sm font-medium text-primary-700">
              {importResult.rows.length} élève(s) détecté(s) depuis{' '}
              {importResult.format === 'excel'
                ? 'Excel/CSV'
                : importResult.format === 'word'
                  ? 'Word'
                  : 'PDF'}.
            </p>

            {importResult.headers.length > 0 && (
              <p className="text-xs text-primary-500 mt-1">
                Colonnes reconnues :{' '}
                {importResult.headers.join(', ')}
              </p>
            )}

            {incompleteRows > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                {incompleteRows} ligne(s) incomplète(s) seront
                ignorée(s) : Nom et Prénom sont obligatoires.
              </p>
            )}

            {invalidFileWhatsApp > 0 && (
              <p className="text-xs text-red-700 mt-1">
                {invalidFileWhatsApp} numéro(s) WhatsApp
                invalide(s). Corrigez-les avant de confirmer.
              </p>
            )}

            {importResult.warnings.map(
              (warning, index) => (
                <p
                  key={index}
                  className="text-xs text-amber-700 mt-1"
                >
                  {warning}
                </p>
              )
            )}
          </div>

          <div className="max-h-64 overflow-auto text-xs border border-primary-100 rounded-lg">
            <table className="w-full">
              <thead className="bg-primary-50 sticky top-0">
                <tr>
                  <th className="text-left p-2">Nom</th>
                  <th className="text-left p-2">Prénom</th>
                  <th className="text-left p-2">Sexe</th>
                  <th className="text-left p-2">Classe</th>
                  <th className="text-left p-2">WhatsApp</th>
                  <th className="text-left p-2">Observation</th>
                </tr>
              </thead>

              <tbody>
                {importResult.rows
                  .slice(0, 50)
                  .map((r, i) => {
                    const incomplete =
                      !r.Nom?.trim() ||
                      !r.Prenom?.trim()

                    const invalidWhatsApp =
                      !!r.WhatsApp &&
                      !isValidWhatsApp(r.WhatsApp)

                    return (
                      <tr
                        key={i}
                        className={`border-t border-primary-50 ${
                          incomplete ||
                          invalidWhatsApp
                            ? 'bg-red-50'
                            : ''
                        }`}
                      >
                        <td className="p-2">
                          {r.Nom || '—'}
                        </td>

                        <td className="p-2">
                          {r.Prenom || '—'}
                        </td>

                        <td className="p-2">
                          {r.Sexe || '—'}
                        </td>

                        <td className="p-2">
                          {r.Classe || '—'}
                        </td>

                        <td className="p-2">
                          {r.WhatsApp || '—'}
                        </td>

                        <td className="p-2">
                          {r.Observation || '—'}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          {importResult.rows.length > 50 && (
            <p className="text-xs text-primary-400">
              Aperçu limité aux 50 premières lignes.
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => void confirmImport()}
              disabled={
                importing ||
                !selectedClass ||
                invalidFileWhatsApp > 0
              }
              className="btn-primary text-sm disabled:opacity-50"
            >
              {importing
                ? 'Import en cours…'
                : `Confirmer l'import dans « ${
                    classes.find(
                      (c) =>
                        c.id === selectedClass
                    )?.name
                  } »`}
            </button>

            <button
              onClick={() => {
                setImportResult(null)
                setImportError('')
              }}
              className="btn-secondary text-sm"
              disabled={importing}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-primary-400">
          Chargement…
        </p>
      ) : students.length === 0 ? (
        <p className="text-sm text-primary-400">
          Aucun élève dans cette classe.
        </p>
      ) : (
        <div className="card divide-y divide-primary-100">
          {students.map((s) => (
            <div
              key={s.id}
              onClick={() =>
                navigate(`/eleves/${s.id}`)
              }
              className="py-2.5 flex items-center justify-between text-sm cursor-pointer hover:bg-primary-50 -mx-5 px-5 rounded-lg"
            >
              <div>
                <p className="font-medium text-primary-800">
                  {s.last_name} {s.first_name}
                </p>

                <p className="text-xs text-primary-400">
                  {s.gender ?? ''}{' '}
                  {s.parent_whatsapp
                    ? `· ${s.parent_whatsapp}`
                    : ''}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleDelete(s)
                  }}
                  className="p-2 text-danger hover:bg-red-100 rounded-lg"
                >
                  <Trash2 size={16} />
                </button>

                <ChevronRight
                  size={16}
                  className="text-primary-300"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 