// src/features/bulletin/bulletin.entries.ts
// Saisies manuelles par élève et par période (conduite, décisions, appréciations…),
// stockées dans la table Supabase « bulletin_entries ».
import { computeBulletin, computeRanks, rankLabel } from './bulletin.compute';
import type { SupabaseLike } from './bulletin.data';
import { computePrimaire } from './primaire.compute';
import type { BulletinData, BulletinTemplate, SubjectScore } from './bulletin.types';
import type {
  EpreuveScore,
  PrimaireData,
  PrimaireTemplate,
  SymboleForme,
  SymboleNiveau,
} from './primaire.types';

/** Notes saisies à la main : secondaire (mi, dev1, dev2, rang, appréciation) ou primaire (note, appréciation). */
export type ScoreOverride = SubjectScore & EpreuveScore;

export interface BulletinEntry {
  /** clé = matière (secondaire) ou épreuve (primaire) ; ne contient que ce qui diffère des notes de la base */
  scores?: Record<string, ScoreOverride>;
  // secondaire
  conduite?: number | null;
  decisionsChecked?: string[];
  chefAppreciation?: string;
  // primaire
  attitudes?: Record<string, string>;
  analyse?: string;
  symbole?: SymboleForme;
  symbolesMensuels?: Record<string, SymboleNiveau>;
  titulaire?: string;
  directeur?: string;
  reponseParents?: string;
  parentNom?: string;
  // commun
  place?: string;
  date?: string;
}

/** Applique les saisies manuelles par-dessus les notes venues de la base. */
export function overlayScores<T extends object>(
  base: Record<string, T>,
  over?: Record<string, Partial<T>>,
): Record<string, T> {
  if (!over) return base;
  const out: Record<string, T> = { ...base };
  for (const key of Object.keys(over)) {
    const patch: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(over[key])) {
      if (value !== undefined) patch[field] = value;
    }
    out[key] = { ...(base[key] ?? {}), ...patch } as T;
  }
  return out;
}

/** Ne garde que les champs qui diffèrent des notes de la base. */
export function diffScores(
  base: Record<string, ScoreOverride>,
  next?: Record<string, ScoreOverride>,
): Record<string, ScoreOverride> {
  const out: Record<string, ScoreOverride> = {};
  if (!next) return out;
  const norm = (v: unknown) => (v === '' ? undefined : v);
  for (const key of Object.keys(next)) {
    const nextRow: Record<string, unknown> = { ...next[key] };
    const baseRow: Record<string, unknown> = { ...(base[key] ?? {}) };
    const kept: Record<string, unknown> = {};
    for (const field of Object.keys(nextRow)) {
      if (nextRow[field] === undefined) continue;
      if (norm(nextRow[field]) !== norm(baseRow[field])) kept[field] = nextRow[field];
    }
    if (Object.keys(kept).length > 0) out[key] = kept as ScoreOverride;
  }
  return out;
}

export function mergeSecondaire(d: BulletinData, e?: BulletinEntry): BulletinData {
  if (!e) return d;
  return {
    ...d,
    scores: overlayScores(d.scores, e.scores),
    conduite: e.conduite !== undefined ? e.conduite : d.conduite,
    decisionsChecked: e.decisionsChecked ?? d.decisionsChecked,
    chefAppreciation: e.chefAppreciation ?? d.chefAppreciation,
    place: e.place ?? d.place,
    date: e.date ?? d.date,
  };
}

export function mergePrimaire(d: PrimaireData, e?: BulletinEntry): PrimaireData {
  if (!e) return d;
  return {
    ...d,
    scores: overlayScores(d.scores, e.scores),
    attitudes: e.attitudes ?? d.attitudes,
    analyse: e.analyse ?? d.analyse,
    symbole: e.symbole ?? d.symbole,
    symbolesMensuels: e.symbolesMensuels ?? d.symbolesMensuels,
    titulaire: e.titulaire ?? d.titulaire,
    directeur: e.directeur ?? d.directeur,
    reponseParents: e.reponseParents ?? d.reponseParents,
    parentNom: e.parentNom ?? d.parentNom,
    place: e.place ?? d.place,
    date: e.date ?? d.date,
  };
}

export async function loadEntries(
  supabase: SupabaseLike,
  classId: string,
  period: number,
): Promise<Record<string, BulletinEntry>> {
  const { data, error } = await supabase
    .from('bulletin_entries')
    .select('student_id,data')
    .eq('class_id', classId)
    .eq('period', period);
  if (error) throw error;
  const out: Record<string, BulletinEntry> = {};
  for (const row of (data ?? []) as { student_id: string; data: BulletinEntry }[]) {
    out[row.student_id] = row.data ?? {};
  }
  return out;
}

export async function saveEntry(
  supabase: SupabaseLike,
  userId: string,
  classId: string,
  period: number,
  studentId: string,
  entry: BulletinEntry,
): Promise<void> {
  const { error } = await supabase.from('bulletin_entries').upsert(
    { user_id: userId, class_id: classId, student_id: studentId, period, data: entry },
    { onConflict: 'user_id,student_id,period' },
  );
  if (error) throw error;
}

/**
 * Bulletins finaux du secondaire : saisies manuelles appliquées, puis moyennes, rangs généraux,
 * rangs par matière, plus forte et plus faible moyenne recalculés sur toute la classe.
 * Un rang de matière saisi à la main est conservé.
 */
export function finalizeSecondaire(
  t: BulletinTemplate,
  rows: { student: { id: string }; data: BulletinData }[],
  entries: Record<string, BulletinEntry>,
): Map<string, BulletinData> {
  const merged = rows.map((r) => {
    const data = mergeSecondaire(r.data, entries[r.student.id]);
    return { id: r.student.id, data, computed: computeBulletin(t, data) };
  });

  const moys = merged.map((m) => m.computed.moyenne);
  const valid = moys.filter((m): m is number => m !== null);
  const ranks = computeRanks(valid);
  const highest = valid.length ? Math.max(...valid) : undefined;
  const lowest = valid.length ? Math.min(...valid) : undefined;

  // rang par matière : classement des moyennes de chaque matière
  const subjectKeys = t.groups.flatMap((g) => g.subjects.map((s) => s.key));
  const subjectRank = new Map<string, Record<string, string>>();
  for (const key of subjectKeys) {
    const entriesOfKey: { id: string; moy: number }[] = [];
    for (const m of merged) {
      const row = m.computed.groups.flatMap((g) => g.rows).find((r) => r.def.key === key);
      if (row && row.moy !== null) entriesOfKey.push({ id: m.id, moy: row.moy });
    }
    const subjectRanks = computeRanks(entriesOfKey.map((e) => e.moy));
    entriesOfKey.forEach((e, idx) => {
      const current = subjectRank.get(e.id) ?? {};
      current[key] = rankLabel(subjectRanks[idx]);
      subjectRank.set(e.id, current);
    });
  }

  const out = new Map<string, BulletinData>();
  let i = 0;
  merged.forEach((m, idx) => {
    const rang = moys[idx] !== null ? rankLabel(ranks[i++]) : undefined;
    const auto = subjectRank.get(m.id) ?? {};
    const scores: Record<string, SubjectScore> = { ...m.data.scores };
    for (const [key, label] of Object.entries(auto)) {
      const manual = scores[key]?.rang;
      scores[key] = { ...(scores[key] ?? {}), rang: manual ? manual : label };
    }
    out.set(m.id, { ...m.data, scores, rang, highest, lowest });
  });
  return out;
}

/** Même chose pour le primaire (rang, plus forte et plus faible moyenne). */
export function finalizePrimaire(
  t: PrimaireTemplate,
  rows: { student: { id: string }; data: PrimaireData }[],
  entries: Record<string, BulletinEntry>,
): Map<string, PrimaireData> {
  const merged = rows.map((r) => ({ id: r.student.id, data: mergePrimaire(r.data, entries[r.student.id]) }));
  const moys = merged.map((m) => computePrimaire(t, m.data).moyenne);
  const valid = moys.filter((m): m is number => m !== null);
  const ranks = computeRanks(valid);
  const plusForte = valid.length ? Math.max(...valid) : undefined;
  const plusFaible = valid.length ? Math.min(...valid) : undefined;

  const out = new Map<string, PrimaireData>();
  let i = 0;
  merged.forEach((m, idx) => {
    const rang = moys[idx] !== null ? rankLabel(ranks[i++]) : undefined;
    out.set(m.id, { ...m.data, rang, plusForte, plusFaible });
  });
  return out;
}
