// src/features/bulletin/bulletin.templates.ts
// Modèles prêts à l'emploi. Pour un nouvel établissement : dupliquer un modèle
// et changer l'en-tête, les colonnes, les matières et les coefficients.
import type { BulletinTemplate } from './bulletin.types';

export const SAINTE_COLETTE: BulletinTemplate = {
  id: 'sainte-colette-trimestre',
  name: 'Collège privé Sainte Colette (trimestriel)',
  rounding: 'truncate',
  header: {
    country: 'REPUBLIQUE DU BENIN',
    ministryLines: [
      "Ministère de l'Enseignement secondaire et",
      'de la Formation Technique et Professionnelle',
    ],
    schoolName: "Collège privé d'Enseignement Général « SAINTE COLETTE »",
    schoolLines: ['BP : TEL : 98 27 37 88 / 95 13 77 97', 'Wibatin (Sékou) /RB'],
  },
  title: 'BULLETIN DE NOTES',
  columns: [
    { key: 'coef', label: 'Coef' },
    { key: 'mi', label: 'MI' },
    { key: 'dev1', label: '1er Dev' },
    { key: 'dev2', label: '2ème Dev' },
    { key: 'moy', label: 'Moy Trim' },
    { key: 'mgCoef', label: 'MG Coef' },
    { key: 'appreciation', label: 'Appréciations des Professeurs' },
  ],
  groups: [
    {
      bilanLabel: 'Bilan Scientifique',
      subjects: [
        { key: 'maths', label: 'MATHS', coef: 3 },
        { key: 'spct', label: 'S.P.C.T', coef: 2 },
        { key: 'svt', label: 'S.V.T', coef: 2 },
      ],
    },
    {
      bilanLabel: 'Bilan Littéraire',
      subjects: [
        { key: 'histgeo', label: 'Histoire-Géo', coef: 2 },
        { key: 'comecrite', label: 'Com. Ecrite / Comp. Français', coef: 2 },
        { key: 'lecture', label: 'Lecture / Ortho-Gram', coef: 2 },
        { key: 'philo', label: 'Philosophie', coef: 2, optional: true },
        { key: 'anglais', label: 'Anglais', coef: 2 },
        { key: 'lv2', label: 'Espagnol ou Allemand', coef: 2 },
      ],
    },
    {
      subjects: [
        { key: 'eco', label: 'Economie', coef: 2, optional: true },
        { key: 'info', label: 'Informatique', coef: 1, optional: true },
        { key: 'eps', label: 'E.P.S', coef: 1 },
      ],
    },
  ],
  conduiteCoef: 1,
  averageLabel: "Moyenne trimestr. de l'Élève",
  showRappel: true,
  showHighest: true,
  showLowest: false,
  decisions: [
    'Félicitations',
    'Encouragements',
    "Tableau d'honneur",
    'Avertissements / Trav',
    'Avertissements / Disc',
    'Blâme / Trav',
    'Blâme / Disc',
  ],
  chefLabel: "Appréciations du chef d'Établissement",
  signatureLabel: 'Cachet et Signature',
};

export const CEG_SEKOU: BulletinTemplate = {
  id: 'ceg-sekou-semestre',
  name: "CEG Sékou (public, semestriel)",
  rounding: 'nearest',
  header: {
    country: 'REPUBLIQUE DU BENIN',
    ministryLines: [],
    schoolName: "COLLÈGE D'ENSEIGNEMENT GÉNÉRAL SEKOU",
    schoolLines: ['BP 127 ALLADA  TÉL : 21 10 01 91'],
  },
  title: 'Bulletin de Notes',
  columns: [
    { key: 'coef', label: 'Coef' },
    { key: 'mi', label: 'Moy Int' },
    { key: 'dev1', label: 'Devoir 1' },
    { key: 'dev2', label: 'Devoir 2' },
    { key: 'moy', label: 'Moy /20' },
    { key: 'mgCoef', label: 'Moy Coef' },
    { key: 'rang', label: 'Rang' },
    { key: 'appreciation', label: 'Appréciations et Signatures des Professeurs' },
  ],
  groups: [
    {
      subjects: [
        { key: 'maths', label: 'MATHS', coef: 3 },
        { key: 'pct', label: 'P.C.T.', coef: 2 },
        { key: 'svt', label: 'S.V.T.', coef: 2 },
        { key: 'comp', label: 'COMP-FRANC / COM-ECRITE', coef: 2 },
        { key: 'lecture', label: 'LECTURE', coef: 2 },
        { key: 'espagnol', label: 'ESPAGNOL', coef: 2 },
        { key: 'histgeo', label: 'HIST - GÉO', coef: 2 },
        { key: 'eco', label: 'ECONOMIE', coef: 2, optional: true },
        { key: 'anglais', label: 'ANGLAIS', coef: 2 },
        { key: 'eps', label: 'E.P.S.', coef: 1 },
        { key: 'allemand', label: 'ALLEMAND', coef: 2, optional: true },
        { key: 'philo', label: 'PHILOSOPHIE', coef: 2, optional: true },
        { key: 'efs', label: 'EFS', coef: 1, optional: true },
        { key: 'pifpel', label: 'P.I.F.P.E.L.', coef: 1, optional: true },
      ],
    },
  ],
  conduiteCoef: 1,
  averageLabel: 'Moyenne 1er semestre',
  showRappel: false,
  showHighest: true,
  showLowest: true,
  decisions: [
    'Encouragements',
    "Tableau d'honneur",
    'Félicitations',
    'Avertissement',
    'Blâme',
  ],
  disciplineItems: [
    'Retards',
    'Absences',
    'Consignes (heures)',
    'Avertissement conduite',
    'Exclusion (en jours)',
  ],
  chefLabel: "OBSERVATIONS DU CHEF D'ETABLISSEMENT",
  signatureLabel: 'Le Directeur',
};

export const BULLETIN_TEMPLATES: BulletinTemplate[] = [SAINTE_COLETTE, CEG_SEKOU];
