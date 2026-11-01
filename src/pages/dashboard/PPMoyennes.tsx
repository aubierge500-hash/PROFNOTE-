import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Save, Trash2, X } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import type { SupabaseLike } from '@/features/bulletin/bulletin.data'
import { fmt } from '@/features/bulletin/bulletin.compute'
import {
  CONDUITE_KEY,
  computeAnnual,
  computePeriod,
  isValidCoef,
  isValidNote,
  parseNote,
  subjectKeyFromName,
  type PPStudent,
  type PPSubjectRow
} from '@/features/pp/pp.compute'
import {
  deletePPRow,
  loadPPClass,
  loadPPRows,
  savePPRow,
  type PPClass,
  type PPStoredRow
} from '@/features/pp/pp.data'

const db = supabase as unknown as SupabaseLike

type View = 'saisie' | 'resultats'

function periodTitle(count: number, period: number): string {
  const nom = count === 2 ? 'Semestre' : 'Trimestre'
  return `${period === 1 ? '1er' : `${period}e`} ${nom.toLowerCase()}`
}

function periodShort(count: number, period: number): string {
  return `${count === 2 ? 'S' : 'T'}${period}`
}

export default function PPMoyennes() {
  const { classId } = useParams<{ classId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [schoolClass, setSchoolClass] = useState<PPClass | null>(null)
  const [students, setStudents] = useState<PPStudent[]>([])
  const [rows, setRows] = useState<PPStoredRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [view, setView] = useState<View>('saisie')
  // 0 = année complète (résultats uniquement)
  const [period, setPeriod] = useState(1)

  // matière en cours de saisie
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [draftCoef, setDraftCoef] = useState('')
  const [draftTeacher, setDraftTeacher] = useState('')
  const [saving, setSaving] = useState(false)

  // formulaire d'ajout
  const [showAdd, setShowAdd] = useState(false)
  const [addKind, setAddKind] = useState<'matiere' | 'conduite'>('matiere')
  const [addName, setAddName] = useState('')
  const [addCoef, setAddCoef] = useState('1')
  const [addTeacher, setAddTeacher] = useState('')

  const periodCount = schoolClass?.period_count ?? 3

  const load = useCallback(async () => {
    if (!classId) return
    setLoading(true)
    setError('')
    try {
      const [cls, stored] = await Promise.all([loadPPClass(db, classId), loadPPRows(db, classId)])
      setSchoolClass(cls.schoolClass)
      setStudents(cls.students)
      setRows(stored)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.')
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    void load()
  }, [load])

  const periodRows = useMemo(() => rows.filter((r) => r.period === period), [rows, period])

  const selectedRow = useMemo(
    () => periodRows.find((r) => r.subjectKey === selectedKey) ?? null,
    [periodRows, selectedKey]
  )

  const periodResults = useMemo(
    () =>
      Array.from({ length: periodCount }, (_, i) =>
        computePeriod(
          students,
          rows.filter((r) => r.period === i + 1) as PPSubjectRow[]
        )
      ),
    [students, rows, periodCount]
  )

  const annual = useMemo(() => computeAnnual(students, periodResults), [students, periodResults])

  function openRow(row: PPStoredRow) {
    setSelectedKey(row.subjectKey)
    const next: Record<string, string> = {}
    for (const student of students) {
      const value = row.averages[student.id]
      next[student.id] = typeof value === 'number' ? String(value).replace('.', ',') : ''
    }
    setDraft(next)
    setDraftCoef(String(row.coef).replace('.', ','))
    setDraftTeacher(row.teacherName ?? '')
    setMessage('')
    setError('')
  }

  function changePeriod(next: number) {
    setPeriod(next)
    setSelectedKey(null)
    setMessage('')
    setError('')
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    if (!user || !classId) return
    setError('')
    setMessage('')

    const name = addKind === 'conduite' ? 'Conduite' : addName.trim()
    if (!name) {
      setError('Le nom de la matière est obligatoire.')
      return
    }
    const coef = parseNote(addCoef)
    if (!isValidCoef(coef, addKind === 'conduite')) {
      setError(
        addKind === 'conduite'
          ? 'Le coefficient de la conduite doit être un nombre (0 pour ne pas la compter).'
          : 'Le coefficient doit être un nombre supérieur à 0.'
      )
      return
    }
    const key = addKind === 'conduite' ? CONDUITE_KEY : subjectKeyFromName(name)
    if (!key) {
      setError('Nom de matière invalide.')
      return
    }
    if (periodRows.some((r) => r.subjectKey === key)) {
      setError(`« ${name} » existe déjà pour cette période.`)
      return
    }

    const row: PPStoredRow = {
      period,
      subjectKey: key,
      kind: addKind,
      subjectName: name,
      coef,
      teacherName: addTeacher.trim() || null,
      averages: {}
    }
    try {
      await savePPRow(db, user.id, classId, row)
      setRows((current) => [...current, row])
      setShowAdd(false)
      setAddName('')
      setAddCoef('1')
      setAddTeacher('')
      openRow(row)
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'ajout a échoué.")
    }
  }

  async function handleSave() {
    if (!user || !classId || !selectedRow) return
    setError('')
    setMessage('')

    const coef = parseNote(draftCoef)
    if (!isValidCoef(coef, selectedRow.kind === 'conduite')) {
      setError('Le coefficient est invalide.')
      return
    }

    const averages: Record<string, number | null> = {}
    for (const student of students) {
      const raw = draft[student.id] ?? ''
      if (raw.trim() === '') continue
      const note = parseNote(raw)
      if (note === null || !isValidNote(note)) {
        setError(`Moyenne invalide pour ${student.last_name} ${student.first_name} (entre 0 et 20).`)
        return
      }
      averages[student.id] = note
    }

    const next: PPStoredRow = {
      ...selectedRow,
      coef,
      teacherName: draftTeacher.trim() || null,
      averages
    }
    setSaving(true)
    try {
      await savePPRow(db, user.id, classId, next)
      setRows((current) =>
        current.map((r) =>
          r.period === next.period && r.subjectKey === next.subjectKey ? next : r
        )
      )
      setMessage(`« ${next.subjectName} » enregistrée.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'enregistrement a échoué.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(row: PPStoredRow) {
    if (!classId) return
    if (!window.confirm(`Supprimer « ${row.subjectName} » pour cette période ?`)) return
    try {
      await deletePPRow(db, classId, row.period, row.subjectKey)
      setRows((current) =>
        current.filter((r) => !(r.period === row.period && r.subjectKey === row.subjectKey))
      )
      if (selectedKey === row.subjectKey) setSelectedKey(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La suppression a échoué.')
    }
  }

  if (loading) return <div className="p-4 text-primary-600">Chargement…</div>

  if (!schoolClass) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-red-700 text-sm">{error || 'Classe introuvable.'}</p>
        <button type="button" className="btn-secondary" onClick={() => navigate('/classes')}>
          Retour aux classes
        </button>
      </div>
    )
  }

  const current = periodResults[period - 1]
  const matiereRows = periodRows.filter((r) => r.kind === 'matiere')
  const conduiteRow = periodRows.find((r) => r.kind === 'conduite')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(`/classes/${schoolClass.id}`)}
          className="rounded-lg bg-primary-50 p-2 text-primary-700"
          aria-label="Retour à la classe"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-primary-800">
            Moyennes générales · {schoolClass.name}
          </h1>
          <p className="text-xs text-primary-500">
            {students.length} élèves · {schoolClass.school_year} · espace du professeur principal
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

      {/* Période */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: periodCount }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => changePeriod(p)}
            className={`rounded-lg px-3 py-2 text-sm ${
              period === p ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-700'
            }`}
          >
            {periodTitle(periodCount, p)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setPeriod(0)
            setView('resultats')
            setSelectedKey(null)
          }}
          className={`rounded-lg px-3 py-2 text-sm ${
            period === 0 ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-700'
          }`}
        >
          Année
        </button>
      </div>

      {period !== 0 && (
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['saisie', 'Saisie des moyennes'],
              ['resultats', 'Moyennes générales']
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`rounded-lg p-3 text-sm ${
                view === key ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ===== SAISIE ===== */}
      {period !== 0 && view === 'saisie' && (
        <section className="card space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-primary-800">
                Matières · {periodTitle(periodCount, period)}
              </h2>
              <p className="text-xs text-primary-500">
                Le coefficient de chaque matière est celui décidé par son professeur.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAdd((v) => !v)
                setAddKind('matiere')
              }}
              className="btn-primary flex items-center gap-1 text-sm"
            >
              <Plus size={16} />
              Matière
            </button>
          </div>

          {showAdd && (
            <form onSubmit={handleAdd} className="rounded-xl bg-primary-50 p-3 space-y-3">
              <div className="flex gap-2 text-sm">
                {(
                  [
                    ['matiere', 'Matière'],
                    ['conduite', 'Conduite']
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={key === 'conduite' && Boolean(conduiteRow)}
                    onClick={() => {
                      setAddKind(key)
                      setAddCoef(key === 'conduite' ? '1' : '1')
                    }}
                    className={`rounded-lg px-3 py-2 disabled:opacity-40 ${
                      addKind === key ? 'bg-primary-600 text-white' : 'bg-white text-primary-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {addKind === 'matiere' && (
                <input
                  className="input-field"
                  placeholder="Nom de la matière (ex. Mathématiques)"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-primary-500">
                    {addKind === 'conduite' ? 'Coefficient (0 = non comptée)' : 'Coefficient'}
                  </label>
                  <input
                    className="input-field"
                    inputMode="decimal"
                    value={addCoef}
                    onChange={(e) => setAddCoef(e.target.value)}
                  />
                </div>
                {addKind === 'matiere' && (
                  <div>
                    <label className="text-xs text-primary-500">Professeur (facultatif)</label>
                    <input
                      className="input-field"
                      value={addTeacher}
                      onChange={(e) => setAddTeacher(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <button type="submit" className="btn-primary text-sm">
                Ajouter
              </button>
            </form>
          )}

          {periodRows.length === 0 ? (
            <p className="text-sm text-primary-500">
              Aucune matière pour cette période. Ajoute une matière avec son coefficient, puis
              saisis les moyennes de tes élèves.
            </p>
          ) : (
            <div className="grid gap-2">
              {[...matiereRows, ...(conduiteRow ? [conduiteRow] : [])].map((row) => {
                const noted = Object.values(row.averages).filter(
                  (v) => typeof v === 'number'
                ).length
                return (
                  <div
                    key={row.subjectKey}
                    className={`rounded-xl border p-3 flex items-center justify-between gap-2 ${
                      selectedKey === row.subjectKey
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-primary-100'
                    }`}
                  >
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => openRow(row)}
                    >
                      <p className="text-sm font-medium text-primary-800">{row.subjectName}</p>
                      <p className="text-xs text-primary-500">
                        coef {fmt(row.coef).replace(',00', '')}
                        {row.teacherName ? ` · ${row.teacherName}` : ''} · {noted}/{students.length}{' '}
                        moyennes
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(row)}
                      className="text-red-600 p-2"
                      aria-label={`Supprimer ${row.subjectName}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {selectedRow && (
            <div className="space-y-3 border-t border-primary-100 pt-3">
              <h3 className="font-medium text-primary-800">{selectedRow.subjectName}</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-primary-500">Coefficient</label>
                  <input
                    className="input-field"
                    inputMode="decimal"
                    value={draftCoef}
                    onChange={(e) => setDraftCoef(e.target.value)}
                  />
                </div>
                {selectedRow.kind === 'matiere' && (
                  <div>
                    <label className="text-xs text-primary-500">Professeur</label>
                    <input
                      className="input-field"
                      value={draftTeacher}
                      onChange={(e) => setDraftTeacher(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                {students.map((student, index) => (
                  <div key={student.id} className="flex items-center gap-2">
                    <span className="w-6 text-xs text-primary-400">{index + 1}</span>
                    <span className="flex-1 text-sm text-primary-800">
                      {student.last_name} {student.first_name}
                    </span>
                    <input
                      className="input-field w-24 text-center"
                      inputMode="decimal"
                      placeholder="/20"
                      value={draft[student.id] ?? ''}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [student.id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-primary-500">
                Laisse vide si l'élève n'a pas de moyenne : il n'est pas compté comme 0.
              </p>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="btn-primary flex items-center gap-2"
              >
                <Save size={16} />
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ===== RÉSULTATS D'UNE PÉRIODE ===== */}
      {period !== 0 && view === 'resultats' && (
        <section className="card space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-primary-50 p-2">
              <p className="text-xs text-primary-400">Plus forte</p>
              <p className="font-semibold text-primary-800">{fmt(current.highest) || '—'}</p>
            </div>
            <div className="rounded-xl bg-primary-50 p-2">
              <p className="text-xs text-primary-400">Plus faible</p>
              <p className="font-semibold text-primary-800">{fmt(current.lowest) || '—'}</p>
            </div>
            <div className="rounded-xl bg-primary-50 p-2">
              <p className="text-xs text-primary-400">Classe</p>
              <p className="font-semibold text-primary-800">{fmt(current.classAverage) || '—'}</p>
            </div>
          </div>

          {periodRows.length === 0 ? (
            <p className="text-sm text-primary-500">
              Aucune matière saisie pour cette période.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-primary-500">
                    <th className="py-2 pr-2">Élève</th>
                    {periodRows.map((r) => (
                      <th key={r.subjectKey} className="px-2 text-center whitespace-nowrap">
                        {r.subjectName}
                        <br />
                        <span className="font-normal">coef {fmt(r.coef).replace(',00', '')}</span>
                      </th>
                    ))}
                    <th className="px-2 text-center">Moy. gén.</th>
                    <th className="px-2 text-center">Rang</th>
                  </tr>
                </thead>
                <tbody>
                  {current.results.map((result) => (
                    <tr key={result.student.id} className="border-t border-primary-100">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {result.student.last_name} {result.student.first_name}
                      </td>
                      {periodRows.map((r) => (
                        <td key={r.subjectKey} className="px-2 text-center">
                          {fmt(r.averages[result.student.id]) || '—'}
                        </td>
                      ))}
                      <td className="px-2 text-center font-semibold text-primary-800">
                        {fmt(result.moyenne) || '—'}
                      </td>
                      <td className="px-2 text-center">{result.rankLabel || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-primary-500">
            Moyenne générale = somme (moyenne × coefficient) ÷ somme des coefficients, sur les
            matières notées de l'élève.
          </p>
        </section>
      )}

      {/* ===== ANNÉE ===== */}
      {period === 0 && (
        <section className="card space-y-3">
          <h2 className="font-semibold text-primary-800">Moyenne annuelle</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-primary-500">
                  <th className="py-2 pr-2">Élève</th>
                  {Array.from({ length: periodCount }, (_, i) => (
                    <th key={i} className="px-2 text-center">
                      {periodShort(periodCount, i + 1)}
                    </th>
                  ))}
                  <th className="px-2 text-center">Annuelle</th>
                  <th className="px-2 text-center">Rang</th>
                </tr>
              </thead>
              <tbody>
                {annual.map((item) => (
                  <tr key={item.student.id} className="border-t border-primary-100">
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {item.student.last_name} {item.student.first_name}
                    </td>
                    {item.periodAverages.map((value, i) => (
                      <td key={i} className="px-2 text-center">
                        {fmt(value) || '—'}
                      </td>
                    ))}
                    <td className="px-2 text-center font-semibold text-primary-800">
                      {fmt(item.moyenne) || '—'}
                    </td>
                    <td className="px-2 text-center">{item.rankLabel || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-primary-500">
            Moyenne annuelle = moyenne des moyennes générales de période.
          </p>
        </section>
      )}
    </div>
  )
}
