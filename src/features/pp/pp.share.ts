// src/features/pp/pp.share.ts
// Partage des moyennes par code : le professeur de matière envoie sa moyenne au PP.
// Contient les appels à la base (fonctions sécurisées) et des fonctions pures testables :
// rapprochement des élèves par le nom et calcul de la moyenne d'une matière.
import type { SupabaseLike } from '@/features/bulletin/bulletin.data'
import { roundTo2 } from '@/features/bulletin/bulletin.compute'
import { subjectKeyFromName, type PPStudent } from './pp.compute'

/* ------------------------------------------------------------------ */
/* Code de partage                                                      */
/* ------------------------------------------------------------------ */

/** Nettoie un code saisi à la main : majuscules, sans espaces ni tirets, 10 caractères au plus. */
export function normalizeShareCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
}

/** 5-5 pour la lecture : « A1B2C-3D4E5 ». */
export function formatShareCode(code: string): string {
  const c = normalizeShareCode(code)
  return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c
}

export function isCompleteShareCode(value: string): boolean {
  return normalizeShareCode(value).length === 10
}

/** Messages de la base nettoyés pour l'affichage. */
export function readableShareError(message: string | undefined, fallback: string): string {
  if (!message) return fallback
  if (
    /Code invalide|Période invalide|Coefficient invalide|Moyenne invalide|Aucune moyenne|Élève invalide|n'appartient pas|Trop de matières|Nom de matière|Classe introuvable|Non connecté/i.test(
      message,
    )
  ) {
    return message
  }
  return fallback
}

export interface SharedClass {
  classId: string
  className: string
  schoolYear: string
  periodCount: 2 | 3
  ppName: string | null
  students: PPStudent[]
}

export interface ActiveShareCode {
  code: string
  createdAt: string
}

export async function getActiveShareCode(
  supabase: SupabaseLike,
  classId: string,
): Promise<ActiveShareCode | null> {
  const { data, error } = await supabase
    .from('pp_share_codes')
    .select('code,created_at')
    .eq('class_id', classId)
    .eq('active', true)
    .limit(1)
  if (error) throw error
  const row = ((data ?? []) as { code: string; created_at: string }[])[0]
  return row ? { code: row.code, createdAt: row.created_at } : null
}

export async function createShareCode(supabase: SupabaseLike, classId: string): Promise<string> {
  const { data, error } = await (supabase as unknown as RpcLike).rpc('pp_create_share_code', {
    p_class_id: classId,
  })
  if (error) throw error
  return String(data)
}

export async function disableShareCode(supabase: SupabaseLike, classId: string): Promise<void> {
  const { error } = await (supabase as unknown as RpcLike).rpc('pp_disable_share_code', {
    p_class_id: classId,
  })
  if (error) throw error
}

export async function lookupShareCode(supabase: SupabaseLike, code: string): Promise<SharedClass> {
  const { data, error } = await (supabase as unknown as RpcLike).rpc('pp_lookup_share_code', {
    p_code: normalizeShareCode(code),
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        class_id: string
        class_name: string
        school_year: string
        period_count: number
        pp_name: string | null
        students: PPStudent[] | null
      }
    | undefined
  if (!row) throw new Error('Code invalide ou désactivé')
  return {
    classId: row.class_id,
    className: row.class_name,
    schoolYear: row.school_year,
    periodCount: row.period_count === 2 ? 2 : 3,
    ppName: row.pp_name,
    students: row.students ?? [],
  }
}

export interface SubmitInput {
  code: string
  period: number
  subjectName: string
  coef: number
  teacherName: string
  /** clé = identifiant de l'élève dans la classe du PP */
  averages: Record<string, number>
}

export async function submitAverages(supabase: SupabaseLike, input: SubmitInput): Promise<number> {
  const { data, error } = await (supabase as unknown as RpcLike).rpc('pp_submit_averages', {
    p_code: normalizeShareCode(input.code),
    p_period: input.period,
    p_subject_key: subjectKeyFromName(input.subjectName),
    p_subject_name: input.subjectName.trim(),
    p_coef: input.coef,
    p_teacher_name: input.teacherName.trim() || null,
    p_averages: input.averages,
  })
  if (error) throw error
  return Number(data ?? 0)
}

type RpcLike = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>
}

/* ------------------------------------------------------------------ */
/* Envois reçus par le PP                                               */
/* ------------------------------------------------------------------ */

export interface ReceivedRow {
  period: number
  senderId: string
  subjectKey: string
  subjectName: string
  coef: number
  teacherName: string | null
  averages: Record<string, number>
  updatedAt: string
}

export async function loadReceived(supabase: SupabaseLike, classId: string): Promise<ReceivedRow[]> {
  const { data, error } = await supabase
    .from('pp_received')
    .select('period,sender_id,subject_key,subject_name,coef,teacher_name,averages,updated_at')
    .eq('class_id', classId)
  if (error) throw error
  return (
    (data ?? []) as {
      period: number
      sender_id: string
      subject_key: string
      subject_name: string
      coef: number | string
      teacher_name: string | null
      averages: Record<string, number> | null
      updated_at: string
    }[]
  ).map((r) => ({
    period: Number(r.period),
    senderId: r.sender_id,
    subjectKey: r.subject_key,
    subjectName: r.subject_name,
    coef: Number(r.coef),
    teacherName: r.teacher_name,
    averages: r.averages ?? {},
    updatedAt: r.updated_at,
  }))
}

export async function deleteReceived(
  supabase: SupabaseLike,
  classId: string,
  row: Pick<ReceivedRow, 'period' | 'senderId' | 'subjectKey'>,
): Promise<void> {
  const { error } = await supabase
    .from('pp_received')
    .delete()
    .eq('class_id', classId)
    .eq('period', row.period)
    .eq('sender_id', row.senderId)
    .eq('subject_key', row.subjectKey)
  if (error) throw error
}

/** Un envoi est « à jour » s'il est déjà identique à la ligne du PP (même coefficient et mêmes moyennes). */
export function isSameAsExisting(
  received: Pick<ReceivedRow, 'coef' | 'averages'>,
  existing: { coef: number; averages: Record<string, number | null | undefined> } | undefined,
): boolean {
  if (!existing) return false
  if (Math.abs(existing.coef - received.coef) > 1e-9) return false
  const a = Object.entries(received.averages).filter(([, v]) => typeof v === 'number')
  const b = Object.entries(existing.averages).filter(([, v]) => typeof v === 'number')
  if (a.length !== b.length) return false
  return a.every(([k, v]) => {
    const other = existing.averages[k]
    return typeof other === 'number' && Math.abs(other - v) < 0.005
  })
}

/* ------------------------------------------------------------------ */
/* Rapprochement des élèves (par le nom, toujours confirmé par l'humain) */
/* ------------------------------------------------------------------ */

export interface NameLike {
  id: string
  last_name: string
  first_name: string
}

function nameTokens(s: NameLike): string[] {
  return `${s.last_name} ${s.first_name}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

export type MatchQuality = 'exact' | 'partiel' | 'aucun'

export interface StudentMatch {
  studentId: string
  ppStudentId: string | null
  quality: MatchQuality
}

/**
 * Propose, pour chaque élève du professeur, l'élève correspondant de la classe du PP.
 * - « exact » : mêmes mots dans le nom et le prénom, quel que soit l'ordre ;
 * - « partiel » : les mots de l'un sont tous contenus dans l'autre (prénom composé, oubli d'un prénom) ;
 * - « aucun » : rien de sûr. On ne devine jamais : le professeur confirme chaque ligne.
 * Un élève du PP n'est proposé qu'une seule fois ; les correspondances exactes passent en premier.
 * `saved` (rapprochements déjà confirmés) a la priorité sur les propositions.
 */
export function proposeMatches(
  own: NameLike[],
  pp: NameLike[],
  saved: Record<string, string> = {},
): StudentMatch[] {
  const ppIds = new Set(pp.map((p) => p.id))
  const used = new Set<string>()
  const result = new Map<string, StudentMatch>()

  // 1) rapprochements déjà enregistrés
  for (const s of own) {
    const target = saved[s.id]
    if (target && ppIds.has(target) && !used.has(target)) {
      used.add(target)
      result.set(s.id, { studentId: s.id, ppStudentId: target, quality: 'exact' })
    }
  }

  const ppTokens = pp.map((p) => ({ p, t: nameTokens(p) }))
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ')
  const contains = (big: string[], small: string[]) => small.every((w) => big.includes(w))

  // 2) correspondances exactes (une seule candidate possible)
  for (const s of own) {
    if (result.has(s.id)) continue
    const t = nameTokens(s)
    const candidates = ppTokens.filter((x) => !used.has(x.p.id) && sameSet(t, x.t))
    if (candidates.length === 1) {
      used.add(candidates[0].p.id)
      result.set(s.id, { studentId: s.id, ppStudentId: candidates[0].p.id, quality: 'exact' })
    }
  }

  // 3) correspondances partielles (une seule candidate possible)
  for (const s of own) {
    if (result.has(s.id)) continue
    const t = nameTokens(s)
    const candidates = ppTokens.filter(
      (x) => !used.has(x.p.id) && (contains(x.t, t) || contains(t, x.t)),
    )
    if (candidates.length === 1 && t.length >= 2) {
      used.add(candidates[0].p.id)
      result.set(s.id, { studentId: s.id, ppStudentId: candidates[0].p.id, quality: 'partiel' })
    }
  }

  return own.map(
    (s) => result.get(s.id) ?? { studentId: s.id, ppStudentId: null, quality: 'aucun' as const },
  )
}

/* ------------------------------------------------------------------ */
/* Moyenne d'une matière pour une période (même règle que les bulletins) */
/* ------------------------------------------------------------------ */

export interface ShareEvaluation {
  id: string
  type: 'interrogation' | 'devoir' | 'composition' | 'examen'
  subject: string
  eval_date: string
  max_score: number
  period: number
}

export interface ShareGrade {
  evaluation_id: string
  student_id: string
  score: number | null
  is_absent: boolean
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null)

export function normalizeSubjectName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Moyenne de la période d'un élève dans une matière, comme sur les bulletins :
 * moyenne des interrogations (MI), devoir 1 et devoir 2 (les notes présentes), le tout ramené sur 20.
 * Renvoie null si l'élève n'a aucune note dans la matière (jamais 0 par défaut).
 */
export function subjectPeriodAverage(
  studentId: string,
  subject: string,
  period: number,
  evaluations: ShareEvaluation[],
  grades: ShareGrade[],
): number | null {
  const wanted = normalizeSubjectName(subject)
  const evals = evaluations
    .filter((e) => e.period === period && normalizeSubjectName(e.subject) === wanted)
    .sort((a, b) => a.eval_date.localeCompare(b.eval_date))
  const byId = new Map(evals.map((e) => [e.id, e]))

  const interros: number[] = []
  const devoirs: number[] = []
  const mine = grades
    .filter((g) => g.student_id === studentId && !g.is_absent && typeof g.score === 'number')
    .map((g) => ({ g, e: byId.get(g.evaluation_id) }))
    .filter((x): x is { g: ShareGrade; e: ShareEvaluation } => Boolean(x.e))
    .sort((a, b) => a.e.eval_date.localeCompare(b.e.eval_date))

  for (const { g, e } of mine) {
    const v = e.max_score > 0 ? ((g.score as number) / e.max_score) * 20 : 0
    if (e.type === 'interrogation') interros.push(v)
    else devoirs.push(v)
  }

  const parts: number[] = []
  const mi = mean(interros)
  if (mi !== null) parts.push(roundTo2(mi, 'nearest'))
  if (devoirs[0] !== undefined) parts.push(roundTo2(devoirs[0], 'nearest'))
  if (devoirs[1] !== undefined) parts.push(roundTo2(devoirs[1], 'nearest'))
  const avg = mean(parts)
  return avg === null ? null : roundTo2(avg, 'nearest')
}

/** Message WhatsApp que le PP envoie à ses collègues. */
export function buildShareWhatsAppUrl(className: string, code: string, origin: string): string {
  const text =
    `Bonjour ! Je suis professeur principal de la ${className}. ` +
    `Pour m'envoyer vos moyennes de la période sur PROFNOTE : ouvrez ${origin}/envoyer-moyennes ` +
    `et saisissez ce code : ${formatShareCode(code)}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
