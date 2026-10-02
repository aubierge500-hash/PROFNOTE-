import { useEffect, useState } from 'react'
import {
  Plus,
  Archive,
  Trash2,
  Pencil,
  FileSpreadsheet,
  FileText
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  exportClassExcel,
  exportClassBulletinsPDF
} from '@/lib/exports'
import ClassWhatsAppSendButton from '@/components/ClassWhatsAppSendButton'
import type { SchoolClass } from '@/types/database'

export default function Classes() {
  const { user, profile } = useAuth()

  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SchoolClass | null>(null)

  const [name, setName] = useState('')
  const [level, setLevel] = useState('')

  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [exportingId, setExportingId] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      void loadClasses()
    }
  }, [user])

  async function loadClasses() {
    if (!user) return

    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', user.id)
      .order('is_archived')
      .order('name')

    if (error) {
      console.error('[Classes] Erreur chargement :', error)
      setErrorMessage(
        `Impossible de charger les classes : ${error.message}`
      )
      setClasses([])
    } else {
      setClasses((data as SchoolClass[]) ?? [])
    }

    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setName('')
    setLevel('')
    setErrorMessage('')
    setShowForm(true)
  }

  function openEdit(c: SchoolClass) {
    setEditing(c)
    setName(c.name)
    setLevel(c.level ?? '')
    setErrorMessage('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!user) {
      setErrorMessage('Utilisateur non connecté.')
      return
    }

    const className = name.trim()
    const classLevel = level.trim()

    if (!className) {
      setErrorMessage('Le nom de la classe est obligatoire.')
      return
    }

    setSaving(true)
    setErrorMessage('')

    try {
      if (editing) {
        const { error } = await supabase
          .from('classes')
          .update({
            name: className,
            level: classLevel || null
          })
          .eq('id', editing.id)
          .eq('teacher_id', user.id)

        if (error) {
          throw error
        }
      } else {
        const startYear =
          new Date().getMonth() >= 7
            ? new Date().getFullYear()
            : new Date().getFullYear() - 1

        const schoolYear = `${startYear}-${startYear + 1}`

        const { error } = await supabase
          .from('classes')
          .insert({
            teacher_id: user.id,
            name: className,
            level: classLevel || null,
            school_year: schoolYear
          })

        if (error) {
          throw error
        }
      }

      setShowForm(false)
      setEditing(null)
      setName('')
      setLevel('')

      await loadClasses()
    } catch (error) {
      console.error('[Classes] Erreur enregistrement :', error)

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible d'enregistrer la classe."
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleArchive(c: SchoolClass) {
    setErrorMessage('')

    const { error } = await supabase
      .from('classes')
      .update({
        is_archived: !c.is_archived
      })
      .eq('id', c.id)
      .eq('teacher_id', user!.id)

    if (error) {
      console.error('[Classes] Erreur archivage :', error)
      setErrorMessage(error.message)
      return
    }

    await loadClasses()
  }

  async function handleDelete(c: SchoolClass) {
    if (
      !confirm(
        `Supprimer la classe « ${c.name} » ? Cette action supprimera aussi les élèves et évaluations liés.`
      )
    ) {
      return
    }

    setErrorMessage('')

    const { error } = await supabase
      .from('classes')
      .delete()
      .eq('id', c.id)
      .eq('teacher_id', user!.id)

    if (error) {
      console.error('[Classes] Erreur suppression :', error)
      setErrorMessage(error.message)
      return
    }

    await loadClasses()
  }

  async function handleExportExcel(c: SchoolClass) {
    setExportingId(`excel-${c.id}`)

    try {
      await exportClassExcel(c.id, c.name, profile)
    } catch (err) {
      console.error(
        '[Export] Erreur lors de la génération du relevé Excel :',
        err
      )

      alert(
        'Une erreur est survenue lors de la génération du relevé. Réessayez dans un instant.'
      )
    } finally {
      setExportingId(null)
    }
  }

  async function handleExportBulletins(c: SchoolClass) {
    setExportingId(`pdf-${c.id}`)

    try {
      await exportClassBulletinsPDF(c.id, c.name, profile)
    } catch (err) {
      console.error(
        '[Export] Erreur lors de la génération des bulletins :',
        err
      )

      alert(
        'Une erreur est survenue lors de la génération des bulletins. Réessayez dans un instant.'
      )
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-primary-800">
          Classes
        </h1>

        <button
          onClick={openCreate}
          className="btn-primary flex items-center gap-1.5 text-sm"
          disabled={saving}
        >
          <Plus size={16} />
          Nouvelle classe
        </button>
      </div>

      {errorMessage && (
        <div className="card border border-red-200 bg-red-50 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {showForm && (
        <div className="card space-y-3">
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1">
              Nom de la classe
            </label>

            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: 6ème A"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1">
              Niveau
            </label>

            <input
              className="input-field"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="Ex: 6ème"
              disabled={saving}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="btn-primary text-sm disabled:opacity-50"
              disabled={saving}
            >
              {saving
                ? 'Enregistrement…'
                : editing
                  ? 'Modifier'
                  : 'Enregistrer'}
            </button>

            <button
              onClick={() => {
                setShowForm(false)
                setErrorMessage('')
              }}
              className="btn-secondary text-sm"
              disabled={saving}
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
      ) : classes.length === 0 ? (
        <p className="text-sm text-primary-400">
          Aucune classe créée pour le moment.
        </p>
      ) : (
        <div className="grid gap-3">
          {classes.map((c) => (
            <div
              key={c.id}
              className={`card ${
                c.is_archived ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-primary-800">
                    {c.name}
                  </p>

                  <p className="text-xs text-primary-400">
                    {c.level ?? ''}
                    {' · '}
                    {c.school_year}

                    {c.is_archived
                      ? ' · Archivée'
                      : ''}
                  </p>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(c)}
                    className="p-2 text-primary-500 hover:bg-primary-50 rounded-lg"
                    disabled={saving}
                  >
                    <Pencil size={16} />
                  </button>

                  <button
                    onClick={() => void toggleArchive(c)}
                    className="p-2 text-primary-500 hover:bg-primary-50 rounded-lg"
                    disabled={saving}
                  >
                    <Archive size={16} />
                  </button>

                  <button
                    onClick={() => void handleDelete(c)}
                    className="p-2 text-danger hover:bg-red-50 rounded-lg"
                    disabled={saving}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-primary-100">
                <button
                  onClick={() => void handleExportExcel(c)}
                  disabled={
                    exportingId === `excel-${c.id}`
                  }
                  className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
                >
                  <FileSpreadsheet size={14} />

                  {exportingId === `excel-${c.id}`
                    ? 'Génération…'
                    : 'Relevé Excel'}
                </button>

                <button
                  onClick={() => void handleExportBulletins(c)}
                  disabled={
                    exportingId === `pdf-${c.id}`
                  }
                  className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
                >
                  <FileText size={14} />

                  {exportingId === `pdf-${c.id}`
                    ? 'Génération…'
                    : 'Bulletins PDF'}
                </button>

                <ClassWhatsAppSendButton
                  classId={c.id}
                  className={c.name}
                  profile={profile}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}