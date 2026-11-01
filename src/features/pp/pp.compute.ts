// src/features/pp/pp.compute.ts
// Calculs du professeur principal (PP) : moyenne générale et rang de la classe.
// Fonctions pures, sans dépendance à React ni à Supabase.
//
// Principe : chaque professeur de matière décide le coefficient de sa matière.
// Le PP saisit (ou reçoit) la moyenne de chaque élève pour chaque matière, avec son coefficient.
// La conduite est une ligne comme les autres : sa note et son coefficient sont choisis par le PP
// (coefficient 0 = la conduite n'entre pas dans la moyenne générale).
import { computeRanks, rankLabel, roundTo2 } from '@/features/bulletin/bulletin.compute'

export type PPRowKind = 'matiere' | 'conduite'

/** Une ligne de saisie : une matière (ou la conduite) pour une période d'une classe. */
export interface PPSubjectRow {
  /** Identifiant stable de la ligne dans la période (ex. « maths », « conduite »). */
  subjectKey: string
  kind: PPRowKind
  subjectName: string
  /** Coefficient décidé par le professeur de la matière (ou par le PP pour la conduite). */
  coef: number
  /** Nom du professeur de la matière (facultatif, utile pour le suivi). */
  teacherName?: string | null
  /** Moyenne de la période par élève : clé = identifiant de l'élève, valeur = note sur 20. */
  averages: Record<string, number | null | undefined>
}

export interface PPStudent {
  id: string
  last_name: string
  first_name: string
}

export interface PPStudentResult {
  student: PPStudent
  /** Somme des (moyenne × coefficient). */
  total: number
  /** Somme des coefficients des matières notées pour cet élève. */
  totalCoef: number
  /** Moyenne générale de la période, ou null si aucune matière notée. */
  moyenne: number | null
  rank: number | null
  rankLabel: string
}

export interface PPPeriodResult {
  results: PPStudentResult[]
  highest: number | null
  lowest: number | null
  classAverage: number | null
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Convertit une saisie (« 12,5 », « 12.50 ») en nombre ; null si vide ou invalide. */
export function parseNote(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (text === '') return null
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

/** Une moyenne est valide si elle est comprise entre 0 et 20. */
export function isValidNote(n: number | null): boolean {
  return n === null || (n >= 0 && n <= 20)
}

/** Un coefficient valide est un nombre positif (0 autorisé pour exclure la conduite). */
export function isValidCoef(n: number | null, allowZero = false): n is number {
  return n !== null && Number.isFinite(n) && (allowZero ? n >= 0 : n > 0)
}

/**
 * Moyenne générale d'un élève pour une période :
 * somme (moyenne × coefficient) ÷ somme des coefficients, sur les lignes où l'élève a une moyenne.
 */
export function studentGeneral(
  studentId: string,
  rows: PPSubjectRow[],
): { total: number; totalCoef: number; moyenne: number | null } {
  let total = 0
  let totalCoef = 0
  for (const row of rows) {
    const note = row.averages[studentId]
    if (!isNum(note) || !isNum(row.coef) || row.coef <= 0) continue
    total += note * row.coef
    totalCoef += row.coef
  }
  return {
    total: roundTo2(total, 'nearest'),
    totalCoef,
    moyenne: totalCoef > 0 ? roundTo2(total / totalCoef, 'nearest') : null,
  }
}

/** Calcule les moyennes générales, les rangs (ex æquo : 1, 2, 2, 4) et les extrêmes d'une période. */
export function computePeriod(students: PPStudent[], rows: PPSubjectRow[]): PPPeriodResult {
  const base = students.map((student) => ({ student, ...studentGeneral(student.id, rows) }))
  const valid = base.map((b) => b.moyenne).filter((m): m is number => m !== null)
  const ranks = computeRanks(valid)

  let i = 0
  const results: PPStudentResult[] = base.map((b) => {
    if (b.moyenne === null) return { ...b, rank: null, rankLabel: '' }
    const rank = ranks[i++]
    return { ...b, rank, rankLabel: rankLabel(rank) }
  })

  return {
    results,
    highest: valid.length ? Math.max(...valid) : null,
    lowest: valid.length ? Math.min(...valid) : null,
    classAverage: valid.length
      ? roundTo2(valid.reduce((a, b) => a + b, 0) / valid.length, 'nearest')
      : null,
  }
}

export interface PPAnnualResult {
  student: PPStudent
  /** Moyenne générale de chaque période (null si non calculable). */
  periodAverages: Array<number | null>
  /** Moyenne des moyennes de période (comme dans PROFNOTE aujourd'hui). */
  moyenne: number | null
  rank: number | null
  rankLabel: string
}

/** Moyenne annuelle = moyenne des moyennes générales de période disponibles, puis rang. */
export function computeAnnual(
  students: PPStudent[],
  periods: PPPeriodResult[],
): PPAnnualResult[] {
  const base = students.map((student, index) => {
    const periodAverages = periods.map((p) => p.results[index]?.moyenne ?? null)
    const present = periodAverages.filter((v): v is number => v !== null)
    const moyenne = present.length
      ? roundTo2(present.reduce((a, b) => a + b, 0) / present.length, 'nearest')
      : null
    return { student, periodAverages, moyenne }
  })

  const valid = base.map((b) => b.moyenne).filter((m): m is number => m !== null)
  const ranks = computeRanks(valid)
  let i = 0
  return base.map((b) => {
    if (b.moyenne === null) return { ...b, rank: null, rankLabel: '' }
    const rank = ranks[i++]
    return { ...b, rank, rankLabel: rankLabel(rank) }
  })
}

/** Normalise un nom de matière en clé stable (« Anglais » → « anglais »). */
export function subjectKeyFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export const CONDUITE_KEY = 'conduite'
