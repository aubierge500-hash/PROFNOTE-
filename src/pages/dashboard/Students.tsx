import { useEffect, useState, type ChangeEvent } from 'react'
import { Plus, Upload, Trash2, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { insertImportedStudents } from '@/lib/studentImport'
import { parseStudentsFile, type ImportResult } from '@/lib/importStudentsFile'
import PhotoImportButton from '@/components/PhotoImportButton'
import type { SchoolClass, Student } from '@/types/database'

export default function Students() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    last_name: '',
    first_name: '',
    gender: '',
    parent_whatsapp: ''
  })

  const [importResult, setImportResult] = useState<ImportResult | null>(null)
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

    await supabase.from('students').insert({
      teacher_id: user!.id,
      class_id: selectedClass,
      last_name: form.last_name,
      first_name: form.first_name,
      gender: form.gender || null,
      parent_whatsapp: form.parent_whatsapp || null
    })

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
    if (!confirm(`Retirer ${s.first_name} ${s.last_name} de la classe ?`)) {
      return
    }

    await supabase
      .from('students')
      .update({ is_active: false })
      .eq('id', s.id)

    void loadStudents()
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
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
      (row) => row.Nom?.trim() && row.Prenom?.trim()
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
        (row) => !row.Nom?.trim() || !row.Prenom?.trim()
      ).length
    : 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-primary-800">
          Élèves
        </h1>

        <div className="flex gap-2">
          <label className="btn-secondary flex items-center gap-1.5 text-sm cursor-pointer">
            <Upload size={16} />
            Importer

            <input
              type="file"
              accept=".csv,.xlsx,.xls,.docx,.pdf"
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>

          <button
            onClick={() => setShowForm(true)}
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
        onChange={(e) => setSelectedClass(e.target.value)}
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
            classes.find((c) => c.id === selectedClass)?.name ?? ''
          }
          onImported={loadStudents}
        />
      )}

      {importError && (
        <div className="card border border-red-200 bg-red-50 text-sm text-red-700">
          {importError}
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
                {incompleteRows} ligne(s) incomplète(s) seront ignorée(s) :
                Nom et Prénom sont obligatoires.
              </p>
            )}

            {importResult.warnings.map((warning, index) => (
              <p
                key={index}
                className="text-xs text-amber-700 mt-1"
              >
                {warning}
              </p>
            ))}
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
                {importResult.rows.slice(0, 50).map((r, i) => {
                  const incomplete =
                    !r.Nom?.trim() || !r.Prenom?.trim()

                  return (
                    <tr
                      key={i}
                      className={`border-t border-primary-50 ${
                        incomplete ? 'bg-red-50' : ''
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
              onClick={confirmImport}
              disabled={importing || !selectedClass}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {importing
                ? 'Import en cours…'
                : `Confirmer l'import dans « ${
                    classes.find(
                      (c) => c.id === selectedClass
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

      {showForm && (
        <div className="card space-y-3">
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
              onClick={handleAddManual}
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