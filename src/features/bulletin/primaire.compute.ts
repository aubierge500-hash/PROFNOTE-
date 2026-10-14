// src/features/bulletin/primaire.compute.ts
import { roundTo2 } from './bulletin.compute';
import type { EpreuveDef, PrimaireData, PrimaireTemplate } from './primaire.types';

/** Appréciation proposée si l'enseignant n'en a pas saisi (barème ramené sur 20). */
export function suggestAppreciation(note: number, sur: number): string {
  const r = sur > 0 ? (note / sur) * 20 : 0;
  if (r >= 18) return 'Très satisfaisant';
  if (r >= 14) return 'Satisfaisant';
  if (r >= 10) return 'Acceptable';
  if (r >= 8) return 'Insuffisant';
  return 'Très insuffisant';
}

export interface PrimaireRow {
  def: EpreuveDef;
  note: number | null;
  sur: number;
  appreciation: string;
  /** null = pas de seuil ou pas de note */
  reussie: boolean | null;
}

export interface PrimaireComputed {
  rows: PrimaireRow[];
  total: number;
  totalSur: number;
  totalSeuil: number;
  moyenne: number | null;
  /** nombre d'épreuves évaluées ayant un seuil */
  nbEvaluees: number;
  nbReussies: number;
  atteintSeuil: boolean;
}

export function computePrimaire(t: PrimaireTemplate, d: PrimaireData): PrimaireComputed {
  let total = 0;
  let totalSur = 0;
  let totalSeuil = 0;
  let nbEvaluees = 0;
  let nbReussies = 0;

  const rows: PrimaireRow[] = t.epreuves.map((def) => {
    const s = d.scores[def.key];
    const n = s?.note;
    const note = typeof n === 'number' && Number.isFinite(n) ? n : null;
    const sur = s?.sur ?? def.sur;
    if (note === null) {
      return { def, note: null, sur, appreciation: s?.appreciation ?? '', reussie: null };
    }
    total += note;
    totalSur += sur;
    let reussie: boolean | null = null;
    if (def.seuil !== undefined) {
      totalSeuil += def.seuil;
      nbEvaluees += 1;
      reussie = note >= def.seuil;
      if (reussie) nbReussies += 1;
    }
    return {
      def,
      note,
      sur,
      reussie,
      appreciation: s?.appreciation || suggestAppreciation(note, sur),
    };
  });

  const required = t.minReussies ?? nbEvaluees;
  return {
    rows,
    total: roundTo2(total, t.rounding),
    totalSur,
    totalSeuil,
    moyenne: totalSur > 0 ? roundTo2((total / totalSur) * t.moyenneSur, t.rounding) : null,
    nbEvaluees,
    nbReussies,
    atteintSeuil: nbEvaluees > 0 && nbReussies >= required,
  };
}
