// src/features/bulletin/BulletinDemo.tsx
// Page d'essai : choisir un modèle, voir le bulletin, imprimer / enregistrer en PDF.
// Données fictives. En production, remplacer DEMO_* par les vraies notes de l'élève.
import { useState } from 'react';
import BulletinSheet from './BulletinSheet';
import { BULLETIN_TEMPLATES } from './bulletin.templates';
import type { BulletinData } from './bulletin.types';

export const DEMO_SAINTE_COLETTE: BulletinData = {
  schoolYear: '2025-2026',
  periodLabel: '2ème TRIMESTRE',
  student: { fullName: 'ÉLÈVE EXEMPLE Prénom', sex: 'M', redoublant: false, classe: '4e', effectif: 17 },
  scores: {
    maths: { mi: 12.5, dev1: 10, dev2: 15, appreciation: 'Assez bien' },
    spct: { mi: 19, dev1: 18, dev2: 14, appreciation: 'Très bien' },
    svt: { mi: 11.5, dev1: 5, dev2: 16, appreciation: 'Passable' },
    histgeo: { mi: 18.5, dev1: 11, dev2: 15, appreciation: 'Bien' },
    comecrite: { mi: 14.5, dev1: 10, dev2: 9, appreciation: 'Passable' },
    lecture: { mi: 16.5, dev1: 14, dev2: 13, appreciation: 'Bien' },
    anglais: { mi: 16, dev1: 16.5, dev2: 11, appreciation: 'Bien' },
    lv2: { mi: 16.66, dev1: 15, dev2: 15, appreciation: 'Bien' },
    eps: { mi: 14, dev1: 15, dev2: 14, appreciation: 'Bien' },
  },
  conduite: 16,
  rang: '4e',
  highest: 15.18,
  rappel: [{ label: '1er Trim', moy: 14.56, rang: '4e' }],
  decisionsChecked: ["Tableau d'honneur"],
  chefAppreciation: 'Travail assez bon',
  place: 'Sékou',
  date: '09/04/2026',
};

export const DEMO_SEKOU: BulletinData = {
  schoolYear: '2023-2024',
  periodLabel: '1er SEMESTRE',
  student: { fullName: 'ÉLÈVE EXEMPLE Prénom', sex: 'M', redoublant: false, classe: '4ème M2', effectif: 64 },
  scores: {
    maths: { mi: 5, dev2: 5, appreciation: 'Médiocre' },
    pct: { mi: 2, dev2: 5, appreciation: 'Très faible' },
    svt: { mi: 13, dev2: 1, appreciation: 'Faible' },
    comp: { mi: 9, dev2: 9, appreciation: 'Insuffisant' },
    lecture: { mi: 13, dev2: 8, appreciation: 'Insuffisant' },
    espagnol: { mi: 5, dev2: 11, appreciation: 'Insuffisant' },
    histgeo: { mi: 15, dev2: 3, appreciation: 'Insuffisant' },
    anglais: { mi: 13, dev2: 10, appreciation: 'Faible' },
    eps: { mi: 16.5, dev2: 17, appreciation: 'Très bien' },
  },
  conduite: 17,
  rang: '59e',
  highest: 18.17,
  lowest: 8.59,
  decisionsChecked: [],
  chefAppreciation: 'Travail insuffisant',
  place: 'Sékou',
  date: '15/02/2024',
};

const DEMOS: Record<string, BulletinData> = {
  'sainte-colette-trimestre': DEMO_SAINTE_COLETTE,
  'ceg-sekou-semestre': DEMO_SEKOU,
};

export default function BulletinDemo() {
  const [id, setId] = useState(BULLETIN_TEMPLATES[0].id);
  const template = BULLETIN_TEMPLATES.find((t) => t.id === id) ?? BULLETIN_TEMPLATES[0];

  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="border rounded px-2 py-1"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          {BULLETIN_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="bg-blue-600 text-white rounded px-3 py-1"
          onClick={() => window.print()}
        >
          Imprimer / PDF
        </button>
      </div>
      <BulletinSheet template={template} data={DEMOS[template.id]} />
    </div>
  );
}
