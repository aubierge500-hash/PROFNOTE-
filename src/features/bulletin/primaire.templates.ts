// src/features/bulletin/primaire.templates.ts
// Modèles du primaire. Pour une autre école : dupliquer et changer l'en-tête / les épreuves.
import type { PrimaireHeader, PrimaireTemplate } from './primaire.types';

const HEADER: PrimaireHeader = {
  country: 'RÉPUBLIQUE DU BÉNIN',
  ministryLines: ['Ministère des Enseignements Maternel et Primaire'],
  schoolName: 'Complexe Scolaire Bilingue « SAINTE COLETTE »',
  schoolLines: ['Allada'],
};

const ATTITUDES = [
  'Assiduité',
  'Discipline',
  "Défauts majeurs identifiés chez l'élève",
  'Qualités remarquables',
];

export const PRIMAIRE_CE_CM: PrimaireTemplate = {
  id: 'primaire-ce-cm-trimestre',
  name: 'Primaire CE / CM — évaluation sommative (notes sur 20)',
  kind: 'notes',
  rounding: 'truncate',
  header: HEADER,
  title: 'ÉVALUATION SOMMATIVE TRIMESTRIELLE',
  moyenneSur: 10,
  attitudes: ATTITUDES,
  analyseLabel: "Analyse pédagogique sommaire des résultats et recommandations de l'enseignant(e) aux parents",
  epreuves: [
    { key: 'com_orale', label: 'Français — Communication orale', sur: 20 },
    { key: 'expr_ecrite', label: 'Français — Expression écrite', sur: 20 },
    { key: 'lecture', label: 'Français — Lecture', sur: 20 },
    { key: 'dictee', label: 'Français — Orthographe / Dictée', sur: 20 },
    { key: 'maths', label: 'Mathématique', sur: 20 },
    { key: 'es_ecrit', label: 'Éducation sociale (écrite)', sur: 20 },
    { key: 'es_oral', label: 'Éducation sociale (orale)', sur: 20, optional: true },
    { key: 'est_ecrit', label: 'Éducation scientifique & technologique (écrite)', sur: 20 },
    { key: 'est_oral', label: 'Éducation scientifique & technologique (orale)', sur: 20, optional: true },
    { key: 'poesie', label: 'EA Poésie', sur: 20 },
    { key: 'anglais', label: 'Anglais', sur: 20 },
    { key: 'dessin', label: 'EA / Dessin', sur: 20 },
    { key: 'couture', label: 'Couture', sur: 20, optional: true },
    { key: 'eps', label: 'EPS', sur: 20 },
  ],
};

export const PRIMAIRE_CI_CP: PrimaireTemplate = {
  id: 'primaire-ci-cp-competences',
  name: 'Primaire CI / CP — évaluation par compétences',
  kind: 'competences',
  rounding: 'truncate',
  header: HEADER,
  title: 'ÉVALUATION SOMMATIVE TRIMESTRIELLE OU DU MOIS',
  moyenneSur: 20,
  attitudes: ATTITUDES,
  analyseLabel: "Recommandations de l'enseignant(e) aux parents",
  epreuves: [
    { key: 'com_orale', label: 'Communication orale', sur: 20, seuil: 10, optional: true },
    { key: 'expr_ecrite', label: 'Expression écrite', sur: 20, seuil: 10 },
    { key: 'lecture', label: "Lecture (compréhension de l'écrit)", sur: 20, seuil: 10 },
    { key: 'dictee', label: 'Orthographe / Dictée', sur: 20, seuil: 10 },
    { key: 'maths', label: 'Mathématiques', sur: 20, seuil: 10 },
    { key: 'es_ecrit', label: 'ES (écrit)', sur: 20, seuil: 10, optional: true },
    { key: 'es_oral', label: 'ES (orale)', sur: 20, seuil: 10, optional: true },
    { key: 'est_ecrit', label: 'EST (écrit)', sur: 20, seuil: 10, optional: true },
    { key: 'est_oral', label: 'EST (orale)', sur: 20, seuil: 10, optional: true },
    { key: 'dessin', label: 'EA Dessin / Couture', sur: 20, seuil: 10 },
    { key: 'vivant', label: 'EA Vivant', sur: 20, seuil: 10 },
    { key: 'eps', label: 'EPS', sur: 20, seuil: 10 },
  ],
  stampUrl?: string;
  signatureUrl?: string;
  teacherSignatureUrl?: string;
  directorSignatureUrl?: string;
  chefLabel?: string;
  signatureLabel?: string;};

export const PRIMAIRE_TEMPLATES: PrimaireTemplate[] = [PRIMAIRE_CE_CM, PRIMAIRE_CI_CP];
