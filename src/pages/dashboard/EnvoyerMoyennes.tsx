import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Send, X } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { loadClasses, type ClassRow, type SupabaseLike } from '@/features/bulletin/bulletin.data'
import { fmt } from '@/features/bulletin/bulletin.compute'
import { isValidCoef, isValidNote, parseNote } from '@/features/pp/pp.compute'
import {
  formatShareCode,
  isCompleteShareCode,
  lookupShareCode,
  normalizeShareCode,
  normalizeSubjectName,
  proposeMatches,
  readableShareError,
  subjectPeriodAverage,
  submitAverages,
  type MatchQuality,
  type NameLike,
  type ShareEvaluation,
  type ShareGrade,
  type SharedClass
} from '@/features/pp/pp.share'

const db = supabase as unknown as SupabaseLike

const OTHER = '__autre__'

interface OwnStudent extends NameLike {
  id: string
}

const QUALITY_STYLE: Record<MatchQuality, string> = {
  exact: 'bg-green-50 text-green-700',
  partiel: 'bg-amber-50 text-amber-700',
  aucun: 'bg-red-50 text-red-700'
}
const QUALITY_LABEL: Record<MatchQuality, string> = {
  exact: 'Sûr',
  partiel: 'À vérifier',
  aucun: 'Non trouvé'
}

function periodName(count: number, period: number): string {
  const nom = count === 2 ? 'semestre' : 'trimestre'
  return `${period === 1 ? '1er' : `${period}e`} ${nom}`
}

async function loadGradesChunked(evalIds: string[]): Promise<ShareGrade[]> {
  const out: ShareGrade[] = []
  for (let i = 0; i < evalIds.length; i += 100) {
    const chunk = evalIds.slice(i, i + 100)
    const { data, error } = await db
      .from('grades')
      .select('evaluation_id,student_id,score,is_absent')
      .in('evaluation_id', chunk)
    if (error) throw error
    for (const g of (data ?? []) as ShareGrade[]) {
      out.push({ ...g, score: g.score === null ? null : Number(g.score) })
    }
  }
  return out
}

export default function EnvoyerMoyennes() {
  const { user, profile } = useAuth()
  const [params] = useSearchParams()

  const [codeInput, setCodeInput] = useState(normalizeShareCode(params.get('code') ?? ''))
  const [shared, setShared] = useState<SharedClass | null>(null)
  const [looking, setLooking] = useState(false)

  const [myClasses, setMyClasses] = useState<ClassRow[]>([])
  const [myClassId, setMyClassId] = useState('')
  const [loadingClass, setLoadingClass] = useState(false)
  const [students, setStudents] = useState<OwnStudent[]>([])
  const [evaluations, setEvaluations] = useState<ShareEvaluation[]>([])
  const [grades, setGrades] = useState<ShareGrade[]>([])

  const [period, setPeriod] = useState(1)
  const [subjectChoice, setSubjectChoice] = useState('')
  const [subjectOther, setSubjectOther] = useState('')
  const [coef, setCoef] = useState('')
  const [teacherName, setTeacherName] = useState(profile?.full_name ?? '')

  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [quality, setQuality] = useState<Record<string, MatchQuality>>({})
  const [draft, setDraft] = useState<Record<string, string>>({})

  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    if (!teacherName && profile?.full_name) setTeacherName(profile.full_name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.full_name])

  useEffect(() => {
    void (async () => {
      try {
        setMyClasses(await loadClasses(db))
      } catch {
        setMyClasses([])
      }
    })()
  }, [])

  async function handleLookup() {
    setError('')
    setDone('')
    if (!isCompleteShareCode(codeInput)) {
      setError('Le code contient 10 caractères (lettres et chiffres).')
      return
    }
    setLooking(true)
    try {
      setShared(await lookupShareCode(db, codeInput))
      setPeriod(1)
    } catch (e) {
      setShared(null)
      setError(
        readableShareError(
          e instanceof Error ? e.message : undefined,
          'Vérification impossible. Contrôle ta connexion puis réessaie.'
        )
      )
    } finally {
      setLooking(false)
    }
  }

  const loadMyClass = useCallback(
    async (classId: string, target: SharedClass) => {
      setLoadingClass(true)
      setError('')
      try {
        const [stu, evs, links] = await Promise.all([
          db
            .from('students')
            .select('id,last_name,first_name')
            .eq('class_id', classId)
            .eq('is_active', true)
            .order('last_name')
            .order('first_name'),
          db
            .from('evaluations')
            .select('id,type,subject,eval_date,max_score,period')
            .eq('class_id', classId),
          db
            .from('pp_student_links')
            .select('student_id,pp_student_id')
            .eq('pp_class_id', target.classId)
        ])
        for (const r of [stu, evs, links]) if (r.error) throw r.error

        const own = (stu.data ?? []) as OwnStudent[]
        const evals = ((evs.data ?? []) as ShareEvaluation[]).map((e) => ({
          ...e,
          max_score: Number(e.max_score),
          period: Number(e.period ?? 1)
        }))
        const g = evals.length ? await loadGradesChunked(evals.map((e) => e.id)) : []

        const saved: Record<string, string> = {}
        for (const l of (links.data ?? []) as { student_id: string; pp_student_id: string }[]) {
          saved[l.student_id] = l.pp_student_id
        }
        const matches = proposeMatches(own, target.students, saved)
        const nextMap: Record<string, string> = {}
        const nextQuality: Record<string, MatchQuality> = {}
        for (const m of matches) {
          nextMap[m.studentId] = m.ppStudentId ?? ''
          nextQuality[m.studentId] = m.quality
        }

        setStudents(own)
        setEvaluations(evals)
        setGrades(g)
        setMapping(nextMap)
        setQuality(nextQuality)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Chargement de ta classe impossible.')
      } finally {
        setLoadingClass(false)
      }
    },
    []
  )

  function handleChooseClass(id: string) {
    setMyClassId(id)
    setSubjectChoice('')
    setSubjectOther('')
    setDraft({})
    setDone('')
    if (id && shared) void loadMyClass(id, shared)
    else {
      setStudents([])
      setEvaluations([])
      setGrades([])
    }
  }

  // Matières de ta classe pour la période choisie.
  const subjects = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of evaluations) {
      if (e.period !== period) continue
      const key = normalizeSubjectName(e.subject)
      if (key && !seen.has(key)) seen.set(key, e.subject.trim())
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [evaluations, period])

  const subjectName = (subjectChoice === OTHER ? subjectOther : subjectChoice).trim()

  // Calcule les moyennes proposées quand la matière ou la période change.
  useEffect(() => {
    if (!myClassId || students.length === 0) return
    const next: Record<string, string> = {}
    if (subjectChoice && subjectChoice !== OTHER) {
      for (const s of students) {
        const avg = subjectPeriodAverage(s.id, subjectChoice, period, evaluations, grades)
        next[s.id] = avg === null ? '' : String(avg).replace('.', ',')
      }
    }
    setDraft(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectChoice, period, myClassId, students, evaluations, grades])

  const usedPP = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping])

  function changeMapping(studentId: string, ppId: string) {
    setMapping((m) => ({ ...m, [studentId]: ppId }))
    setQuality((q) => ({ ...q, [studentId]: ppId ? 'exact' : 'aucun' }))
  }

  const ready = useMemo(() => {
    const sendable = students.filter((s) => mapping[s.id] && parseNote(draft[s.id] ?? '') !== null)
    return sendable.length
  }, [students, mapping, draft])

  const unmappedWithNote = students.filter(
    (s) => !mapping[s.id] && parseNote(draft[s.id] ?? '') !== null
  )

  const ppWithoutNote = useMemo(() => {
    if (!shared) return 0
    const covered = new Set(
      students
        .filter((s) => mapping[s.id] && parseNote(draft[s.id] ?? '') !== null)
        .map((s) => mapping[s.id])
    )
    return shared.students.filter((p) => !covered.has(p.id)).length
  }, [shared, students, mapping, draft])

  async function handleSend() {
    if (!shared || !user) return
    setError('')
    setDone('')

    if (!subjectName) {
      setError('Choisis ou saisis ta matière.')
      return
    }
    const c = parseNote(coef)
    if (!isValidCoef(c)) {
      setError('Le coefficient de ta matière est obligatoire (nombre supérieur à 0).')
      return
    }

    const averages: Record<string, number> = {}
    for (const s of students) {
      const ppId = mapping[s.id]
      if (!ppId) continue
      const raw = (draft[s.id] ?? '').trim()
      if (raw === '') continue
      const note = parseNote(raw)
      if (note === null || !isValidNote(note)) {
        setError(`Moyenne invalide pour ${s.last_name} ${s.first_name} (entre 0 et 20).`)
        return
      }
      averages[ppId] = note
    }
    if (Object.keys(averages).length === 0) {
      setError('Aucune moyenne à envoyer : rapproche au moins un élève et saisis sa moyenne.')
      return
    }

    setSending(true)
    try {
      const count = await submitAverages(db, {
        code: codeInput,
        period,
        subjectName,
        coef: c,
        teacherName,
        averages
      })

      // On mémorise les rapprochements confirmés pour les prochains envois.
      const links = students
        .filter((s) => mapping[s.id])
        .map((s) => ({
          user_id: user.id,
          pp_class_id: shared.classId,
          student_id: s.id,
          pp_student_id: mapping[s.id]
        }))
      if (links.length) {
        await db.from('pp_student_links').upsert(links, { onConflict: 'user_id,pp_class_id,student_id' })
      }

      setDone(
        `Envoyé : ${count} moyenne${count > 1 ? 's' : ''} de ${subjectName} (coef ${fmt(c).replace(',00', '')}) pour la ${shared.className}.`
      )
    } catch (e) {
      setError(
        readableShareError(e instanceof Error ? e.message : undefined, "L'envoi a échoué. Réessaie.")
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-primary-800">Envoyer mes moyennes au PP</h1>
        <p className="text-xs text-primary-500">
          Le professeur principal t'a donné un code : saisis-le pour lui envoyer la moyenne de ta
          matière et son coefficient.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
      )}
      {done && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 flex items-start gap-2">
          <Check size={16} className="mt-0.5 shrink-0" />
          <span>{done} Tu peux renvoyer si tu corriges une note : l'envoi précédent est remplacé.</span>
        </div>
      )}

      {/* 1. Code */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-primary-800">1. Code du professeur principal</h2>
        <div className="flex gap-2">
          <input
            className="input-field flex-1 tracking-widest text-center uppercase"
            placeholder="XXXXX-XXXXX"
            value={formatShareCode(codeInput)}
            onChange={(e) => {
              setCodeInput(normalizeShareCode(e.target.value))
              setShared(null)
              setMyClassId('')
            }}
          />
          <button
            type="button"
            disabled={looking}
            onClick={() => void handleLookup()}
            className="btn-primary text-sm"
          >
            {looking ? 'Vérification…' : 'Valider'}
          </button>
        </div>
        {shared && (
          <div className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">
            <p className="font-medium">
              Classe : {shared.className} · {shared.schoolYear}
            </p>
            <p className="text-xs text-primary-500">
              {shared.ppName ? `Professeur principal : ${shared.ppName} · ` : ''}
              {shared.students.length} élèves · {shared.periodCount === 2 ? 'semestres' : 'trimestres'}
            </p>
          </div>
        )}
      </section>

      {/* 2. Ma classe et ma matière */}
      {shared && (
        <section className="card space-y-3">
          <h2 className="font-semibold text-primary-800">2. Ta classe et ta matière</h2>

          <div>
            <label className="text-xs text-primary-500">Ta classe (la même que {shared.className})</label>
            <select
              className="input-field"
              value={myClassId}
              onChange={(e) => handleChooseClass(e.target.value)}
            >
              <option value="">— choisir —</option>
              {myClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.school_year}
                </option>
              ))}
            </select>
            {myClasses.length === 0 && (
              <p className="text-xs text-primary-500 mt-1">
                Tu n'as pas encore de classe dans PROFNOTE. Crée ta classe et tes élèves d'abord.
              </p>
            )}
          </div>

          {myClassId && (
            <>
              <div>
                <label className="text-xs text-primary-500">Période</label>
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: shared.periodCount }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPeriod(p)
                        setSubjectChoice('')
                      }}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        period === p ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-700'
                      }`}
                    >
                      {periodName(shared.periodCount, p)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-primary-500">Matière</label>
                <select
                  className="input-field"
                  value={subjectChoice}
                  onChange={(e) => setSubjectChoice(e.target.value)}
                >
                  <option value="">— choisir —</option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value={OTHER}>Autre matière (je saisis les moyennes à la main)</option>
                </select>
                {subjects.length === 0 && (
                  <p className="text-xs text-primary-500 mt-1">
                    Aucune évaluation trouvée pour cette période dans ta classe : choisis « Autre
                    matière » et saisis les moyennes.
                  </p>
                )}
                {subjectChoice === OTHER && (
                  <input
                    className="input-field mt-2"
                    placeholder="Nom de la matière (ex. Mathématiques)"
                    value={subjectOther}
                    onChange={(e) => setSubjectOther(e.target.value)}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-primary-500">Coefficient de ta matière</label>
                  <input
                    className="input-field"
                    inputMode="decimal"
                    placeholder="ex. 3"
                    value={coef}
                    onChange={(e) => setCoef(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-primary-500">Ton nom</label>
                  <input
                    className="input-field"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* 3. Élèves et moyennes */}
      {shared && myClassId && (
        <section className="card space-y-3">
          <h2 className="font-semibold text-primary-800">3. Vérifie les élèves et les moyennes</h2>
          {loadingClass ? (
            <p className="text-sm text-primary-500">Chargement…</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-primary-500">Cette classe n'a pas d'élèves.</p>
          ) : (
            <>
              <p className="text-xs text-primary-500">
                Pour chaque élève, confirme l'élève correspondant chez le professeur principal. Les
                moyennes viennent de tes évaluations (même calcul que les bulletins) ; tu peux les
                corriger. Une case vide = pas de note.
              </p>
              <div className="space-y-2">
                {students.map((s) => (
                  <div key={s.id} className="rounded-xl border border-primary-100 p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-primary-800">
                        {s.last_name} {s.first_name}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${QUALITY_STYLE[quality[s.id] ?? 'aucun']}`}
                      >
                        {QUALITY_LABEL[quality[s.id] ?? 'aucun']}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <select
                        className="input-field flex-1 text-sm"
                        value={mapping[s.id] ?? ''}
                        onChange={(e) => changeMapping(s.id, e.target.value)}
                      >
                        <option value="">— élève du PP —</option>
                        {shared.students
                          .filter((p) => !usedPP.has(p.id) || mapping[s.id] === p.id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.last_name} {p.first_name}
                            </option>
                          ))}
                      </select>
                      <input
                        className="input-field w-20 text-center"
                        inputMode="decimal"
                        placeholder="/20"
                        value={draft[s.id] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {unmappedWithNote.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {unmappedWithNote.length} élève(s) avec une moyenne ne seront pas envoyés car ils ne
                  sont pas rapprochés d'un élève du PP.
                </div>
              )}
              {ready > 0 && ppWithoutNote > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {ppWithoutNote} élève(s) du PP n'auront pas de moyenne dans ta matière : le PP ne
                  pourra pas calculer leur moyenne générale.
                </div>
              )}

              <button
                type="button"
                disabled={sending || ready === 0}
                onClick={() => void handleSend()}
                className="btn-primary flex items-center gap-2"
              >
                <Send size={16} />
                {sending ? 'Envoi…' : `Envoyer ${ready} moyenne${ready > 1 ? 's' : ''} au PP`}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  )
}
