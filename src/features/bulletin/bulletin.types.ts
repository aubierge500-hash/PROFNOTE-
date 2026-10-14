// src/features/bulletin/bulletin.types.ts
// Modèle de données des bulletins personnalisables PROFNOTE.

export type Rounding = 'truncate' | 'nearest';

export type ColumnKey =
  | 'coef'
  | 'mi'
  | 'dev1'
  | 'dev2'
  | 'moy'
  | 'mgCoef'
  | 'rang'
  | 'appreciation';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
}

export interface SubjectDef {
  key: string;
  label: string;
  coef: number;
  /** Matière non enseignée dans toutes les classes (ligne laissée vide si pas de notes) */
  optional?: boolean;
}

export interface SubjectGroup {
  /** Si défini, une ligne de bilan (ex. « Bilan Scientifique ») est affichée sous le groupe */
  bilanLabel?: string;
  subjects: SubjectDef[];
}

export interface HeaderDef {
  country: string;
  ministryLines: string[];
  schoolName: string;
  schoolLines: string[];
  logoUrl?: string;
}

export interface BulletinTemplate {
  id: string;
  name: string;
  /** « truncate » = on coupe à 2 décimales (usage Sainte Colette), « nearest » = arrondi classique */
  rounding: Rounding;
  header: HeaderDef;
  title: string;
  columns: ColumnDef[];
  groups: SubjectGroup[];
  conduiteCoef: number;
  averageLabel: string;
  showRappel: boolean;
  showHighest: boolean;
  showLowest: boolean;
  decisions: string[];
  disciplineItems?: string[];
  chefLabel: string;
  signatureLabel: string;
}

export interface SubjectScore {
  mi?: number | null;
  dev1?: number | null;
  dev2?: number | null;
  rang?: string;
  appreciation?: string;
}

export interface RappelItem {
  label: string;
  moy: number;
  rang: string;
}

export interface BulletinData {
  schoolYear: string;
  periodLabel: string;
  student: {
    fullName: string;
    sex: 'M' | 'F';
    redoublant: boolean;
    matricule?: string;
    classe: string;
    effectif: number;
  };
  /** clé = SubjectDef.key */
  scores: Record<string, SubjectScore>;
  conduite?: number | null;
  rang?: string;
  highest?: number;
  lowest?: number;
  rappel?: RappelItem[];
  decisionsChecked: string[];
  chefAppreciation?: string;
  place: string;
  date: string;
}
