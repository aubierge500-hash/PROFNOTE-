// src/features/bulletin/bulletin.data.ts
// Branche les tables Supabase de PROFNOTE (classes, students, evaluations, grades)
// sur les bulletins du secondaire et du primaire.
import { computeBulletin, computeRanks, rankLabel, roundTo2 } from './bulletin.compute';
import { BULLETIN_TEMPLATES } from './bulletin.templates';
import type { BulletinData, BulletinTemplate, SubjectScore } from './bulletin.types';
import { computePrimaire } from './primaire.compute';
import { PRIMAIRE_TEMPLATES } from './primaire.templates';
import type { PrimaireData, PrimaireTemplate } from './primaire.types';
import { applyTemplateOverride, type TemplateOverrides } from './bulletin.template-edit';

/* ------------------------------------------------------------------ */
/* Types des lignes lues dans Supabase                                  */
/* ------------------------------------------------------------------ */
export interface ClassRow {
  id: string;
  name: string;
  level: string | null;
  school_year: string;
  period_count: number;
}
export interface StudentRow {
  id: string;
  last_name: string;
  first_name: string;
  gender: 'M' | 'F' | null;
  matricule: string | null;
}
export interface EvaluationRow {
  id: string;
  type: 'interrogation' | 'devoir' | 'composition' | 'examen';
  subject: string;
  eval_date: string;
  max_score: number;
  period: number;
}
export interface GradeRow {
  evaluation_id: string;
  student_id: string;
  score: number | null;
  is_absent: boolean;
}

/** Client Supabase minimal (on évite d'imposer une version de @supabase/supabase-js). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseLike = { from: (table: string) => any };

/* ------------------------------------------------------------------ */
/* Normalisation des matières                                           */
/* ------------------------------------------------------------------ */
export function normalizeSubject(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * matière normalisée -> clés possibles dans les modèles (la première clé présente dans le modèle gagne).
 * Ajoute ici tes propres noms de matières si besoin.
 */
const ALIASES: Record<string, string[]> = {
  maths: ['maths'],
  mathematiques: ['maths'],
  mathematique: ['maths'],
  pct: ['spct', 'pct'],
  spct: ['spct', 'pct'],
  'physique chimie technologie': ['spct', 'pct'],
  svt: ['svt'],
  'histoire geographie': ['histgeo'],
  'hist geo': ['histgeo'],
  histoire: ['histgeo'],
  'histoire geo': ['histgeo'],
  francais: ['comecrite', 'comp', 'lecture'],
  'communication ecrite': ['comecrite', 'comp'],
  'composition francaise': ['comecrite', 'comp'],
  redaction: ['comecrite', 'comp'],
  lecture: ['lecture'],
  orthographe: ['lecture'],
  grammaire: ['lecture'],
  anglais: ['anglais'],
  espagnol: ['lv2', 'espagnol'],
  allemand: ['lv2', 'allemand'],
  eps: ['eps'],
  philosophie: ['philo'],
  economie: ['eco'],
  informatique: ['info'],
  // primaire
  'expression ecrite': ['expr_ecrite'],
  'communication orale': ['com_orale'],
  dictee: ['dictee'],
  poesie: ['poesie'],
  dessin: ['dessin'],
  couture: ['couture'],
  'education sociale': ['es_ecrit'],
  es: ['es_ecrit'],
  'education scientifique': ['est_ecrit'],
  est: ['est_ecrit'],
};

function resolveKey(
  subject: string,
  validKeys: Set<string>,
  labelKeys?: Map<string, string>,
): string | null {
  const norm = normalizeSubject(subject);
  const cands = ALIASES[norm] ?? [];
  const found = cands.find((k) => validKeys.has(k));
  if (found) return found;
  // matière ajoutée par l'enseignant : on la retrouve par son nom (ou sa clé)
  return labelKeys?.get(norm) ?? (validKeys.has(norm) ? norm : null);
}

function labelMap(items: { key: string; label: string }[]): Map<string, string> {
  return new Map(items.map((i) => [normalizeSubject(i.label), i.key]));
}

/* ------------------------------------------------------------------ */
/* Choix du modèle selon la classe                                      */
/* ------------------------------------------------------------------ */
export function isPrimaire(c: ClassRow): boolean {
  const txt = `${c.level ?? ''} ${c.name}`.trim().toLowerCase();
  return /\b(primaire|ci|cp|ce1|ce2|cm1|cm2)\b/.test(txt);
}

export function pickTemplate(c: ClassRow): BulletinTemplate | PrimaireTemplate {
  if (isPrimaire(c)) {
    const txt = `${c.level ?? ''} ${c.name}`.toLowerCase();
    const ciCp = /\b(ci|cp)\b/.test(txt);
    return PRIMAIRE_TEMPLATES.find((t) => (ciCp ? t.kind === 'competences' : t.kind === 'notes'))!;
  }
  // Secondaire : 2 périodes = semestriel (CEG Sékou), 3 = trimestriel (Sainte Colette)
  return (
    BULLETIN_TEMPLATES.find((t) => (c.period_count === 2 ? t.id.includes('semestre') : t.id.includes('trimestre'))) ??
    BULLETIN_TEMPLATES[0]
  );
}

/* ------------------------------------------------------------------ */
/* Calculs communs                                                      */
/* ------------------------------------------------------------------ */
const to20 = (score: number, max: number) => (max > 0 ? (score / max) * 20 : 0);
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

export function periodLabel(c: ClassRow, period: number): string {
  const nom = c.period_count === 2 ? 'SEMESTRE' : 'TRIMESTRE';
  return `${period === 1 ? '1er' : `${period}ème`} ${nom}`;
}

interface PerSubject {
  mi: number | null;
  devs: number[];
  all: number[];
}

/** Regroupe les notes (ramenées sur 20) d'un élève par clé de matière du modèle. */
function gatherScores(
  studentId: string,
  evals: EvaluationRow[],
  grades: GradeRow[],
  validKeys: Set<string>,
  labelKeys?: Map<string, string>,
): Record<string, PerSubject> {
  const byEval = new Map(evals.map((e) => [e.id, e]));
  const mine = grades
    .filter((g) => g.student_id === studentId && !g.is_absent && typeof g.score === 'number')
    .map((g) => ({ g, e: byEval.get(g.evaluation_id) }))
    .filter((x): x is { g: GradeRow; e: EvaluationRow } => !!x.e)
    .sort((a, b) => a.e.eval_date.localeCompare(b.e.eval_date));

  const interros: Record<string, number[]> = {};
  const devs: Record<string, number[]> = {};
  const all: Record<string, number[]> = {};

  for (const { g, e } of mine) {
    const key = resolveKey(e.subject, validKeys, labelKeys);
    if (!key) continue;
    const v = to20(g.score as number, e.max_score);
    (all[key] ??= []).push(v);
    if (e.type === 'interrogation') (interros[key] ??= []).push(v);
    else (devs[key] ??= []).push(v);
  }

  const out: Record<string, PerSubject> = {};
  for (const key of new Set([...Object.keys(interros), ...Object.keys(devs)])) {
    out[key] = { mi: mean(interros[key] ?? []), devs: devs[key] ?? [], all: all[key] ?? [] };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Secondaire                                                           */
/* ------------------------------------------------------------------ */
export function buildSecondaire(
  t: BulletinTemplate,
  c: ClassRow,
  students: StudentRow[],
  evals: EvaluationRow[],
  grades: GradeRow[],
  period: number,
  extra: { school?: string; place?: string } = {},
): { student: StudentRow; data: BulletinData; moyenne: number | null }[] {
  const keys = new Set(t.groups.flatMap((g) => g.subjects.map((s) => s.key)));
  const labels = labelMap(t.groups.flatMap((g) => g.subjects));
  const pEvals = evals.filter((e) => e.period === period);
  const today = new Date().toLocaleDateString('fr-FR');

  const rows = students.map((s) => {
    const gathered = gatherScores(s.id, pEvals, grades, keys, labels);
    const scores: Record<string, SubjectScore> = {};
    for (const [k, v] of Object.entries(gathered)) {
      scores[k] = {
        mi: v.mi === null ? null : roundTo2(v.mi, t.rounding),
        dev1: v.devs[0] === undefined ? null : roundTo2(v.devs[0], t.rounding),
        dev2: v.devs[1] === undefined ? null : roundTo2(v.devs[1], t.rounding),
      };
    }
    const data: BulletinData = {
      schoolYear: c.school_year,
      periodLabel: periodLabel(c, period),
      student: {
        fullName: `${s.last_name} ${s.first_name}`,
        sex: s.gender ?? 'M',
        redoublant: false,
        matricule: s.matricule ?? undefined,
        classe: c.name,
        effectif: students.length,
      },
      scores,
      conduite: null,
      decisionsChecked: [],
      place: extra.place ?? '',
      date: today,
    };
    return { student: s, data, moyenne: computeBulletin(t, data).moyenne };
  });

  const moys = rows.map((r) => r.moyenne).filter((m): m is number => m !== null);
  const ranks = computeRanks(moys);
  const highest = moys.length ? Math.max(...moys) : undefined;
  const lowest = moys.length ? Math.min(...moys) : undefined;

  let i = 0;
  for (const r of rows) {
    if (r.moyenne !== null) r.data.rang = rankLabel(ranks[i++]);
    r.data.highest = highest;
    r.data.lowest = lowest;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Primaire                                                             */
/* ------------------------------------------------------------------ */
export function buildPrimaire(
  t: PrimaireTemplate,
  c: ClassRow,
  students: StudentRow[],
  evals: EvaluationRow[],
  grades: GradeRow[],
  period: number,
  extra: { place?: string } = {},
): { student: StudentRow; data: PrimaireData; moyenne: number | null }[] {
  const keys = new Set(t.epreuves.map((e) => e.key));
  const labels = labelMap(t.epreuves);
  const pEvals = evals.filter((e) => e.period === period);
  const today = new Date().toLocaleDateString('fr-FR');

  const rows = students.map((s) => {
    const gathered = gatherScores(s.id, pEvals, grades, keys, labels);
    const scores: PrimaireData['scores'] = {};
    for (const [k, v] of Object.entries(gathered)) {
      const m = mean(v.all);
      if (m !== null) scores[k] = { note: roundTo2(m, t.rounding) };
    }
    const data: PrimaireData = {
      schoolYear: c.school_year,
      periodLabel: periodLabel(c, period),
      student: {
        fullName: `${s.last_name} ${s.first_name}`,
        sex: s.gender ?? undefined,
        matricule: s.matricule ?? undefined,
        classe: c.name,
        effectif: students.length,
      },
      scores,
      attitudes: {},
      place: extra.place ?? '',
      date: today,
    };
    return { student: s, data, moyenne: computePrimaire(t, data).moyenne };
  });

  const moys = rows.map((r) => r.moyenne).filter((m): m is number => m !== null);
  const ranks = computeRanks(moys);
  const plusForte = moys.length ? Math.max(...moys) : undefined;
  const plusFaible = moys.length ? Math.min(...moys) : undefined;

  let i = 0;
  for (const r of rows) {
    if (r.moyenne !== null) r.data.rang = rankLabel(ranks[i++]);
    r.data.plusForte = plusForte;
    r.data.plusFaible = plusFaible;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Chargement depuis Supabase                                           */
/* ------------------------------------------------------------------ */
export async function loadClasses(supabase: SupabaseLike): Promise<ClassRow[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('id,name,level,school_year,period_count')
    .eq('is_archived', false)
    .order('name');
  if (error) throw error;
  return data as ClassRow[];
}

export interface ClassBulletins {
  class: ClassRow;
  template: BulletinTemplate | PrimaireTemplate;
  kind: 'secondaire' | 'primaire';
  secondaire?: ReturnType<typeof buildSecondaire>;
  primaire?: ReturnType<typeof buildPrimaire>;
}

export async function loadClassBulletins(
  supabase: SupabaseLike,
  classId: string,
  period: number,
  templateId?: string,
  overrides?: TemplateOverrides,
): Promise<ClassBulletins> {
  const [cls, stu, evs] = await Promise.all([
    supabase.from('classes').select('id,name,level,school_year,period_count').eq('id', classId).single(),
    supabase
      .from('students')
      .select('id,last_name,first_name,gender,matricule')
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('last_name'),
    supabase
      .from('evaluations')
      .select('id,type,subject,eval_date,max_score,period')
      .eq('class_id', classId)
      .eq('period', period),
  ]);
  for (const r of [cls, stu, evs]) if (r.error) throw r.error;

  const c = cls.data as ClassRow;
  const students = stu.data as StudentRow[];
  const evals = (evs.data as EvaluationRow[]).map((e) => ({ ...e, max_score: Number(e.max_score) }));

  let grades: GradeRow[] = [];
  if (evals.length) {
    const g = await supabase
      .from('grades')
      .select('evaluation_id,student_id,score,is_absent')
      .in('evaluation_id', evals.map((e) => e.id));
    if (g.error) throw g.error;
    grades = (g.data as GradeRow[]).map((x) => ({ ...x, score: x.score === null ? null : Number(x.score) }));
  }

  const chosen = templateId
    ? [...BULLETIN_TEMPLATES, ...PRIMAIRE_TEMPLATES].find((t) => t.id === templateId)
    : undefined;
  const baseTemplate = chosen ?? pickTemplate(c);
  const template = applyTemplateOverride(baseTemplate, overrides?.[baseTemplate.id]);
  const primaire = chosen ? PRIMAIRE_TEMPLATES.some((t) => t.id === chosen.id) : isPrimaire(c);
  if (primaire) {
    return {
      class: c,
      template,
      kind: 'primaire',
      primaire: buildPrimaire(template as PrimaireTemplate, c, students, evals, grades, period),
    };
  }
  return {
    class: c,
    template,
    kind: 'secondaire',
    secondaire: buildSecondaire(template as BulletinTemplate, c, students, evals, grades, period),
  };
}
