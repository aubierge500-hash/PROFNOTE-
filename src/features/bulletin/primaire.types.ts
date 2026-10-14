// src/features/bulletin/primaire.types.ts
// Bulletins du primaire PROFNOTE : « notes » (CE/CM) et « compétences » (CI/CP).
import type { Rounding } from './bulletin.types';

export type PrimaireKind = 'notes' | 'competences';

export type SymboleNiveau =
  | 'tres-satisfaisant'
  | 'satisfaisant'
  | 'peu-satisfaisant'
  | 'acceptable'
  | 'insuffisant'
  | 'tres-insuffisant';

export type SymboleForme = 'smile' | 'circle' | 'D';

export interface EpreuveDef {
  key: string;
  label: string;
  /** Barème (« Sur » / pondération), 20 par défaut */
  sur: number;
  /** CI/CP : note minimale exigée pour réussir l'épreuve (critère minimal) */
  seuil?: number;
  /** Ligne laissée vide si l'épreuve n'est pas évaluée */
  optional?: boolean;
}

export interface PrimaireHeader {
  country: string;
  ministryLines: string[];
  schoolName: string;
  schoolLines: string[];
  logoUrl?: string;
}

export interface PrimaireTemplate {
  id: string;
  name: string;
  kind: PrimaireKind;
  rounding: Rounding;
  header: PrimaireHeader;
  title: string;
  epreuves: EpreuveDef[];
  /** Moyenne = total obtenu / total des barèmes × moyenneSur (10 pour CE/CM, 20 pour CI/CP) */
  moyenneSur: number;
  /** CI/CP : nombre minimal d'épreuves réussies pour « atteint le seuil » (défaut : toutes) */
  minReussies?: number;
  /** Rubriques « Attitudes » (assiduité, discipline…) */
  attitudes: string[];
  /** Libellé de la zone texte pour les parents */
  analyseLabel: string;
}

export interface EpreuveScore {
  note?: number | null;
  /** Remplace le barème du modèle pour cette épreuve */
  sur?: number;
  appreciation?: string;
}

export interface PrimaireData {
  schoolYear: string;
  periodLabel: string;
  student: {
    fullName: string;
    sex?: 'M' | 'F';
    matricule?: string;
    classe: string;
    effectif: number;
  };
  /** clé = EpreuveDef.key */
  scores: Record<string, EpreuveScore>;
  rang?: string;
  plusForte?: number;
  plusFaible?: number;
  /** clé = libellé de PrimaireTemplate.attitudes */
  attitudes: Record<string, string>;
  analyse?: string;
  /** CE/CM : symbole mérité par l'élève */
  symbole?: SymboleForme;
  /** CI/CP : grille mensuelle, clé = mois (« Oct », « Nov »…) */
  symbolesMensuels?: Record<string, SymboleNiveau>;
  titulaire?: string;
  directeur?: string;
  reponseParents?: string;
  parentNom?: string;
  place: string;
  date: string;
}
