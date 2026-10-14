// src/features/bulletin/PrimaireDemo.tsx
// Page d'essai du primaire (données fictives) : choisir CE/CM ou CI/CP, voir, imprimer / PDF.
import { useState } from 'react';
import PrimaireSheet from './PrimaireSheet';
import { PRIMAIRE_TEMPLATES } from './primaire.templates';
import type { PrimaireData } from './primaire.types';

export const DEMO_CE_CM: PrimaireData = {
  schoolYear: '2025-2026',
  periodLabel: '2ème TRIMESTRE — Évaluation N° 2',
  student: { fullName: 'ÉLÈVE EXEMPLE Prénom', sex: 'F', classe: 'CM1', effectif: 41 },
  scores: {
    com_orale: { note: 15 },
    expr_ecrite: { note: 19.5 },
    lecture: { note: 20 },
    dictee: { note: 20 },
    maths: { note: 19.75 },
    es_ecrit: { note: 20 },
    est_ecrit: { note: 19.5 },
    poesie: { note: 16 },
    anglais: { note: 20, appreciation: 'Excellent' },
    dessin: { note: 16 },
    eps: { note: 16 },
  },
  rang: '1ère',
  plusFaible: 5.38,
  plusForte: 9.18,
  attitudes: { Assiduité: 'Bonne', Discipline: 'Bonne' },
  analyse: "Travail très satisfaisant. Tableau d'honneur.",
  symbole: 'smile',
  titulaire: 'Mme Exemple',
  directeur: 'M. Exemple',
  place: 'Allada',
  date: '10/04/2026',
};

export const DEMO_CI_CP: PrimaireData = {
  schoolYear: '2025-2026',
  periodLabel: 'Évaluation sommative du mois de Juin 2026',
  student: { fullName: 'ÉLÈVE EXEMPLE Prénom', sex: 'M', classe: 'CP', effectif: 30 },
  scores: {
    expr_ecrite: { note: 16 },
    lecture: { note: 12 },
    dictee: { note: 16 },
    maths: { note: 16 },
    est_ecrit: { note: 14 },
    dessin: { note: 16 },
    vivant: { note: 17 },
    eps: { note: 17 },
    com_orale: { note: 16 },
  },
  plusForte: 16.44,
  plusFaible: 11.22,
  attitudes: { Assiduité: 'Bonne', Discipline: 'Bonne' },
  analyse: 'Travail satisfaisant.',
  symbolesMensuels: { Juin: 'satisfaisant' },
  place: 'Allada',
  date: '19/06/2026',
};

const DEMOS: Record<string, PrimaireData> = {
  'primaire-ce-cm-trimestre': DEMO_CE_CM,
  'primaire-ci-cp-competences': DEMO_CI_CP,
};

export default function PrimaireDemo() {
  const [id, setId] = useState(PRIMAIRE_TEMPLATES[0].id);
  const template = PRIMAIRE_TEMPLATES.find((t) => t.id === id) ?? PRIMAIRE_TEMPLATES[0];

  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="border rounded px-2 py-1" value={id} onChange={(e) => setId(e.target.value)}>
          {PRIMAIRE_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="bg-blue-600 text-white rounded px-3 py-1" onClick={() => window.print()}>
          Imprimer / PDF
        </button>
      </div>
      <PrimaireSheet template={template} data={DEMOS[template.id]} />
    </div>
  );
}
