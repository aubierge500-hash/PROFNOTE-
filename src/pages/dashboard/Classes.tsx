import { useEffect, useState } from 'react'
import { Plus, Archive, Trash2, Pencil, FileSpreadsheet, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { exportClassExcel, exportClassBulletinsPDF } from '@/lib/exports'
import type { SchoolClass } from '@/types/database'

export default function Classes() {
  const { user, profile } = useAuth()
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SchoolClass | null>(null)
  const [name, setName] = useState('')
  const [level, setLevel] = useState('')
  const [exportingId, setExportingId] = useState<string | null>(null)

  useEffect(() => {
    if (user) void loadClasses()
  }, [user])

  async function loadClasses() {
    setLoading(true)
    const { data } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', user!.id)
      .order('is_archived')
      .order('name')
    setClasses((data as SchoolClass[]) ?? [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setName('')
    setLevel('')
    setShowForm(true)
  }

  function openEdit(c: SchoolClass) {
    setEditing(c)
    setName(c.name)
    setLevel(c.level ?? '')
    setShowForm(true)
  }

  async function handleSave() {
    if (!name.trim()) return
    if (editing) {
      await supabase.from('classes').update({ name, level }).eq('id', editing.id)
    } else {
      await supabase.from('classes').insert({ teacher_id: user!.id, name, level })
    }
    setShowForm(false)
    void loadClasses()
  }

  async function toggleArchive(c: SchoolClass) {
    await supabase.from('classes').update({ is_archived: !c.is_archived }).eq('id', c.id)
    void loadClasses()
  }

  async function handleDelete(c: SchoolClass) {
    if (!confirm(`Supprimer la classe « ${c.name} » ? Cette action supprimera aussi les élèves et évaluations liés.`)) return
    await supabase.from('classes').delete().eq('id', c.id)
    void loadClasses()
  }

  async function handleExportExcel(c: SchoolClass) {
    setExportingId(`excel-${c.id}`)
    try {
      await exportClassExcel(c.id, c.name, profile)
    } catch (err) {
      console.error('[Export] Erreur lors de la génération du relevé Excel :', err)
      alert("Une erreur est survenue lors de la génération du relevé. Réessayez dans un instant.")
    } finally {
      setExportingId(null)
    }
  }

  async function handleExportBulletins(c: SchoolClass) {
    setExportingId(`pdf-${c.id}`)
    try {
      await exportClassBulletinsPDF(c.id, c.name, profile)
    } catch (err) {
      console.error('[Export] Erreur lors de la génération des bulletins :', err)
      alert("Une erreur est survenue lors de la génération des bulletins. Réessayez dans un instant.")
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-primary-800">Classes</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16} /> Nouvelle classe
        </button>
      </div>

      {showForm && (
        <div className="card space-y-3">
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1">Nom de la classe</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: 6ème A" />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1">Niveau</label>
            <input className="input-field" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="Ex: 6ème" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="btn-primary text-sm">Enregistrer</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">Annuler</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-primary-400">Chargement…</p>
      ) : classes.length === 0 ? (
        <p className="text-sm text-primary-400">Aucune classe créée pour le moment.</p>
      ) : (
        <div className="grid gap-3">
          {classes.map((c) => (
            <div key={c.id} className={`card ${c.is_archived ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-primary-800">{c.name}</p>
                  <p className="text-xs text-primary-400">{c.level} · {c.school_year}{c.is_archived ? ' · Archivée' : ''}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(c)} className="p-2 text-primary-500 hover:bg-primary-50 rounded-lg">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => toggleArchive(c)} className="p-2 text-primary-500 hover:bg-primary-50 rounded-lg">
                    <Archive size={16} />
                  </button>
                  <button onClick={() => handleDelete(c)} className="p-2 text-danger hover:bg-red-50 rounded-lg">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-primary-100">
                <button
                  onClick={() => handleExportExcel(c)}
                  disabled={exportingId === `excel-${c.id}`}
                  className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
                >
                  <FileSpreadsheet size={14} />
                  {exportingId === `excel-${c.id}` ? 'Génération…' : 'Relevé Excel'}
                </button>
                <button
                  onClick={() => handleExportBulletins(c)}
                  disabled={exportingId === `pdf-${c.id}`}
                  className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
                >
                  <FileText size={14} />
                  {exportingId === `pdf-${c.id}` ? 'Génération…' : 'Bulletins PDF'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
         }
