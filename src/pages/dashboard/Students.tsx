import { useEffect, useState, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { Plus, Upload, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import type { SchoolClass, Student } from '@/types/database'

interface ImportedRow {
  Nom?: string
  Prenom?: string
  Sexe?: string
  Classe?: string
  WhatsApp?: string
  Observation?: string
}

export default function Students() {
  const { user } = useAuth()
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ last_name: '', first_name: '', gender: '', parent_whatsapp: '' })
  const [importPreview, setImportPreview] = useState<ImportedRow[] | null>(null)

  useEffect(() => {
    if (user) void init()
  }, [user])

  useEffect(() => {
    if (user) void loadStudents()
  }, [user, selectedClass])

  async function init() {
    const { data } = await supabase.from('classes').select('*').eq('teacher_id', user!.id).eq('is_archived', false).order('name')
    setClasses((data as SchoolClass[]) ?? [])
    if (data && data.length > 0) setSelectedClass((data[0] as SchoolClass).id)
  }

  async function loadStudents() {
    setLoading(true)
    let query = supabase.from('students').select('*').eq('teacher_id', user!.id).eq('is_active', true).order('last_name')
    if (selectedClass) query = query.eq('class_id', selectedClass)
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
    setForm({ last_name: '', first_name: '', gender: '', parent_whatsapp: '' })
    setShowForm(false)
    void loadStudents()
  }

  async function handleDelete(s: Student) {
    if (!confirm(`Retirer ${s.first_name} ${s.last_name} de la classe ?`)) return
    await supabase.from('students').update({ is_active: false }).eq('id', s.id)
    void loadStudents()
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const isCsv = file.name.toLowerCase().endsWith('.csv')

    if (isCsv) {
      Papa.parse<ImportedRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => setImportPreview(result.data)
      })
    } else {
      const reader = new FileReader()
      reader.onload = (evt) => {
        const wb = XLSX.read(evt.target?.result, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<ImportedRow>(sheet)
        setImportPreview(rows)
      }
      reader.readAsArrayBuffer(file)
    }
    e.target.value = ''
  }

  async function confirmImport() {
    if (!importPreview || !selectedClass) return
    const rows = importPreview
      .filter((r) => r.Nom || r.Prenom)
      .map((r) => ({
        teacher_id: user!.id,
        class_id: selectedClass,
        last_name: (r.Nom ?? '').toString().trim(),
        first_name: (r.Prenom ?? '').toString().trim(),
        gender: (r.Sexe ?? '').toString().trim().toUpperCase().startsWith('F') ? 'F' : (r.Sexe ? 'M' : null),
        parent_whatsapp: r.WhatsApp ? String(r.WhatsApp).trim() : null,
        note: r.Observation ?? null
      }))

    if (rows.length === 0) return
    await supabase.from('students').insert(rows)
    setImportPreview(null)
    void loadStudents()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-primary-800">Élèves</h1>
        <div className="flex gap-2">
          <label className="btn-secondary flex items-center gap-1.5 text-sm cursor-pointer">
            <Upload size={16} /> Importer
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileSelect} />
          </label>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={16} /> Ajouter
          </button>
        </div>
      </div>

      <select className="input-field max-w-xs" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {importPreview && (
        <div className="card space-y-3">
          <p className="text-sm font-medium text-primary-700">
            {importPreview.length} ligne(s) détectée(s). Colonnes attendues : Nom, Prenom, Sexe, Classe, WhatsApp, Observation.
          </p>
          <div className="max-h-48 overflow-auto text-xs border border-primary-100 rounded-lg">
            <table className="w-full">
              <thead className="bg-primary-50 sticky top-0">
                <tr>
                  <th className="text-left p-2">Nom</th><th className="text-left p-2">Prénom</th><th className="text-left p-2">Sexe</th><th className="text-left p-2">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-t border-primary-50">
                    <td className="p-2">{r.Nom}</td><td className="p-2">{r.Prenom}</td><td className="p-2">{r.Sexe}</td><td className="p-2">{r.WhatsApp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button onClick={confirmImport} className="btn-primary text-sm">Confirmer l'import dans « {classes.find(c => c.id === selectedClass)?.name} »</button>
            <button onClick={() => setImportPreview(null)} className="btn-secondary text-sm">Annuler</button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="card space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className="input-field" placeholder="Nom" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            <input className="input-field" placeholder="Prénom" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <select className="input-field" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Sexe</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
            <input className="input-field" placeholder="WhatsApp parent (+229...)" value={form.parent_whatsapp} onChange={(e) => setForm({ ...form, parent_whatsapp: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddManual} className="btn-primary text-sm">Enregistrer</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">Annuler</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-primary-400">Chargement…</p>
      ) : students.length === 0 ? (
        <p className="text-sm text-primary-400">Aucun élève dans cette classe.</p>
      ) : (
        <div className="card divide-y divide-primary-100">
          {students.map((s) => (
            <div key={s.id} className="py-2.5 flex items-center justify-between text-sm">
              <div>
                <p className="font-medium text-primary-800">{s.last_name} {s.first_name}</p>
                <p className="text-xs text-primary-400">{s.gender ?? ''} {s.parent_whatsapp ? `· ${s.parent_whatsapp}` : ''}</p>
              </div>
              <button onClick={() => handleDelete(s)} className="p-2 text-danger hover:bg-red-50 rounded-lg">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
