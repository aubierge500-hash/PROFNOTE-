// src/features/bulletin/bulletin.compute.ts
import type {
  BulletinData,
  BulletinTemplate,
  Rounding,
  SubjectDef,
  SubjectScore,
} from './bulletin.types';

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export function roundTo2(n: number, mode: Rounding): number {
  return mode === 'truncate'
    ? Math.trunc(n * 100 + 1e-6) / 100
    : Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 13.9 -> "13,90" (virgule française). Vide si pas de valeur. */
export function fmt(n: number | null | undefined): string {
  return isNum(n) ? n.toFixed(2).replace('.', ',') : '';
}

export function rankLabel(rank: number): string {
  return rank === 1 ? '1er' : `${rank}e`;
}

/** Rang avec ex æquo (1, 2, 2, 4). Renvoie les rangs dans le même ordre que l'entrée. */
export function computeRanks(averages: number[]): number[] {
  return averages.map((a) => 1 + averages.filter((b) => b > a).length);
}

/** Moyenne de la période d'une matière : moyenne des notes présentes (MI, dev1, dev2). */
export function periodAverage(score?: SubjectScore): number | null {
  if (!score) return null;
  const v = [score.mi, score.dev1, score.dev2].filter(isNum);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export interface ComputedRow {
  def: SubjectDef;
  moy: number | null;
  mgCoef: number | null;
}

export interface ComputedGroup {
  rows: ComputedRow[];
  bilan: number | null;
}

export interface ComputedBulletin {
  groups: ComputedGroup[];
  total: number;
  totalCoef: number;
  moyenne: number | null;
}

export function computeBulletin(
  t: BulletinTemplate,
  d: BulletinData,
): ComputedBulletin {
  let sum = 0;
  let coefs = 0;

  const groups = t.groups.map((g) => {
    let gSum = 0;
    let gCoef = 0;
    const rows: ComputedRow[] = g.subjects.map((def) => {
      const exact = periodAverage(d.scores[def.key]);
      if (exact === null) return { def, moy: null, mgCoef: null };
      // Méthode des bulletins : MG Coef = moyenne déjà arrondie/tronquée × coef
      const moy = roundTo2(exact, t.rounding);
      const mgCoef = roundTo2(moy * def.coef, t.rounding);
      gSum += mgCoef;
      gCoef += def.coef;
      return { def, moy, mgCoef };
    });
    sum += gSum;
    coefs += gCoef;
    return {
      rows,
      bilan: gCoef > 0 ? roundTo2(gSum / gCoef, t.rounding) : null,
    };
  });

  if (isNum(d.conduite)) {
    sum += d.conduite * t.conduiteCoef;
    coefs += t.conduiteCoef;
  }

  return {
    groups,
    total: roundTo2(sum, t.rounding),
    totalCoef: coefs,
    moyenne: coefs > 0 ? roundTo2(sum / coefs, t.rounding) : null,
  };
}
