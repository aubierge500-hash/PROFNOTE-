import { useState, type ChangeEvent } from 'react'
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
import {
  insertImportedStudents,
  type ImportedRow
} from '@/lib/studentImport'
import {
  parseStudentsFile,
  type ImportResult
} from '@/lib/importStudentsFile'
import PhotoImportButton from '@/components/PhotoImportButton'
import type { Student } from '@/types/database'

interface Props {
  classId: string
  teacherId: string
  className: string
  students: Student[]
  onReload: () => Promise<void>
}

export default function ClassStudentsManager({
  classId,
  teacherId,
  className,
  students,
  onReload
}: Props) {
  const navigate = useNavigate()

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

  async function handleAddManual() {
    if (!form.last_name.trim()) return

    const { error } = await supabase
      .from('students')
      .insert({
        teacher_id: teacherId,
        class_id: classId,
        last_name: form.last_name.trim(),
        first_name: form.first_name.trim(),
        gender: form.gender || null,
        parent_whatsapp: form.parent_whatsapp || null,
        is_active: true
      })

    if (error) {
      setImportError(
        `Impossible d'ajouter l'élève : ${error.message}`
      )
      return
    }

    setForm({
      last_name: '',
      first_name: '',
      gender: '',
      parent_whatsapp: ''
    })

    setShowForm(false)
    setImportError('')

    await onReload()
  }

  async function handleDelete(student: Student) {
    if (
      !confirm(
        `Retirer ${student.first_name} ${student.last_name} de la classe ?`
      )
    ) {
      return
    }

    const { error } = await supabase
      .from('students')
      .update({ is_active: false })
      .eq('id', student.id)
      .eq('teacher_id', teacherId)

    if (error) {
      setImportError(
        `Impossible de retirer l'élève : ${error.message}`
      )
      return
    }

    await onReload()
  }

  function parsePastedStudents(
    text: string
  ): ImportedRow[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    const rows: ImportedRow[] = []

    for (const line of lines) {
      let columns: string[] = []

      if (line.includes('\t')) {
        columns = line.split('\t')
      } else if (line.includes(';')) {
        columns = line.split(';')
      } else if (line.includes(',')) {
        columns = line.split(',')
      } else {
        columns = line.split(/\s+/)
      }

      columns = columns
        .map((value) => value.trim())
        .filter(Boolean)

      if (columns.length < 2) continue

      const first = columns[0]
      const second = columns[1]
      const third = columns[2] ?? ''

      const possibleGender =
        third.trim().toUpperCase()

      const gender =
        possibleGender === 'F' ||
        possibleGender === 'M'
          ? possibleGender
          : ''

      rows.push({
        Nom: first,
        Prenom: second,
        Sexe: gender
      })
    }

    return rows
  }

  function previewPastedStudents() {
    setPasteError('')

    const rows =
      parsePastedStudents(pasteText)

    if (rows.length === 0) {
      setPasteRows([])
      setPasteError(
        'Aucun élève détecté. Collez au minimum le Nom et le Prénom de chaque élève.'
      )
      return
    }

    setPasteRows(rows)
  }

  async function confirmPastedImport() {
    if (
      pasteRows.length === 0
    ) {
      return
    }

    setPasteImporting(true)
    setPasteError('')

    try {
      await insertImportedStudents(
        pasteRows,
        teacherId,
        classId
      )

      setPasteText('')
      setPasteRows([])
      setShowPasteImport(false)

      await onReload()
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
      const result =
        await parseStudentsFile(file)

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
    if (!importResult) return

    const validRows =
      importResult.rows.filter(
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

    setImporting(true)
    setImportError('')

    try {
      await insertImportedStudents(
        validRows,
        teacherId,
        classId
      )

      setImportResult(null)

      await onReload()
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

  const incompleteRows =
    importResult
      ? importResult.rows.filter(
          (row) =>
            !row.Nom?.trim() ||
            !row.Prenom?.trim()
        ).length
      : 0

  return (
    <section className="card space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="font-semibold text-primary-800">
            Élèves de {className}
          </h2>

          <p className="text-sm text-primary-400 mt-1">
            {students.length} élève
            {students.length > 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
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
            type="button"
            onClick={() => {
              setShowPasteImport(false)
              setShowForm(true)
              setImportError('')
            }}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus size={16} />
            Ajouter
          </button>
        </div>
      </div>

      <PhotoImportButton
        classId={classId}
        teacherId={teacherId}
        className={className}
        onImported={onReload}
      />

      {importError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {importError}
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border border-primary-100 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-primary-800">
              Ajouter un élève
            </h3>

            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="p-1 text-primary-500 hover:bg-primary-50 rounded"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setShowPasteImport(true)
                setShowForm(false)
              }}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <ClipboardPaste size={16} />
              Coller une liste
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
              type="button"
              onClick={() =>
                void handleAddManual()
              }
              disabled={!form.last_name.trim()}
              className="btn-primary text-sm disabled:opacity-50"
            >
              Enregistrer
            </button>

            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn-secondary text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {showPasteImport && (
        <div className="rounded-lg border-2 border-primary-100 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-primary-800">
                Importer plusieurs élèves
              </h3>

              <p className="text-xs text-primary-400 mt-1">
                Collez directement votre liste.
              </p>
            </div>

            <button
              type="button"
              onClick={closePasteImport}
              disabled={pasteImporting}
              className="p-1 text-primary-500 hover:bg-primary-50 rounded"
            >
              <X size={18} />
            </button>
          </div>

          <div className="rounded-lg bg-primary-50 p-3 text-xs text-primary-600">
            <p className="font-medium mb-1">
              Format accepté :
            </p>

            <p>
              Nom → Prénom → Sexe
            </p>

            <p className="mt-1">
              Exemple : AHOTON&nbsp;&nbsp;Grâce&nbsp;&nbsp;F
            </p>
          </div>

          <textarea
            className="input-field min-h-48 resize-y font-mono text-sm"
            placeholder={`AHOTON\tGrâce\tF
ADJOVI\tKévin\tM
AGBOSSOU\tMariam\tF`}
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
                      <th className="text-left p-2">N°</th>
                      <th className="text-left p-2">Nom</th>
                      <th className="text-left p-2">Prénom</th>
                      <th className="text-left p-2">Sexe</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pasteRows.map(
                      (row, index) => (
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
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={previewPastedStudents}
              disabled={
                pasteImporting ||
                !pasteText.trim()
              }
              className="btn-secondary text-sm"
            >
              Vérifier la liste
            </button>

            <button
              type="button"
              onClick={() =>
                void confirmPastedImport()
              }
              disabled={
                pasteImporting ||
                pasteRows.length === 0
              }
              className="btn-primary text-sm disabled:opacity-50"
            >
              {pasteImporting
                ? 'Import en cours…'
                : `Importer ${pasteRows.length || ''} élève${
                    pasteRows.length > 1
                      ? 's'
                      : ''
                  }`}
            </button>

            <button
              type="button"
              onClick={closePasteImport}
              disabled={pasteImporting}
              className="btn-secondary text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {importResult && (
        <div className="rounded-lg border border-primary-100 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-primary-700">
              {importResult.rows.length} élève(s)
              détecté(s) depuis{' '}
              {importResult.format === 'excel'
                ? 'Excel/CSV'
                : importResult.format === 'word'
                  ? 'Word'
                  : 'PDF'}
              .
            </p>

            {importResult.headers.length > 0 && (
              <p className="text-xs text-primary-500 mt-1">
                Colonnes reconnues :{' '}
                {importResult.headers.join(', ')}
              </p>
            )}

            {incompleteRows > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                {incompleteRows} ligne(s) incomplète(s)
                seront ignorée(s).
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
                  .map((row, index) => {
                    const incomplete =
                      !row.Nom?.trim() ||
                      !row.Prenom?.trim()

                    return (
                      <tr
                        key={index}
                        className={`border-t border-primary-50 ${
                          incomplete
                            ? 'bg-red-50'
                            : ''
                        }`}
                      >
                        <td className="p-2">
                          {row.Nom || '—'}
                        </td>
                        <td className="p-2">
                          {row.Prenom || '—'}
                        </td>
                        <td className="p-2">
                          {row.Sexe || '—'}
                        </td>
                        <td className="p-2">
                          {row.Classe || '—'}
                        </td>
                        <td className="p-2">
                          {row.WhatsApp || '—'}
                        </td>
                        <td className="p-2">
                          {row.Observation || '—'}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                void confirmImport()
              }
              disabled={importing}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {importing
                ? 'Import en cours…'
                : `Confirmer l'import dans « ${className} »`}
            </button>

            <button
              type="button"
              onClick={() => {
                setImportResult(null)
                setImportError('')
              }}
              disabled={importing}
              className="btn-secondary text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {students.length === 0 ? (
        <div className="rounded-lg bg-primary-50 p-4">
          <p className="text-sm text-primary-500">
            Aucun élève dans cette classe.
          </p>

          <p className="text-xs text-primary-400 mt-1">
            Utilisez « Ajouter », « Importer » ou
            « Coller une liste ».
          </p>
        </div>
      ) : (
        <div className="divide-y divide-primary-100">
          {students.map((student, index) => (
            <div
              key={student.id}
              className="py-3 flex items-center gap-3"
            >
              <span className="w-7 text-xs text-primary-400">
                {index + 1}
              </span>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/eleves/${student.id}`
                  )
                }
                className="flex-1 text-left hover:bg-primary-50 rounded-lg px-2 py-1"
              >
                <p className="font-medium text-primary-800 text-sm">
                  {student.last_name}{' '}
                  {student.first_name}
                </p>

                <p className="text-xs text-primary-400">
                  {student.gender ?? ''}
                  {student.parent_whatsapp
                    ? ` · ${student.parent_whatsapp}`
                    : ''}
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  void handleDelete(student)
                }
                className="p-2 text-danger hover:bg-red-100 rounded-lg"
                title="Retirer de la classe"
              >
                <Trash2 size={16} />
              </button>

              <ChevronRight
                size={16}
                className="text-primary-300"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}