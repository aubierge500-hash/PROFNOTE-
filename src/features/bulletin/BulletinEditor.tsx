// src/features/bulletin/BulletinEditor.tsx
// Formulaire de saisie des éléments propres à chaque élève (conduite, décisions, appréciations…).
import type { ReactNode } from 'react';
import type { BulletinEntry, ScoreOverride } from './bulletin.entries';
import type { BulletinTemplate } from './bulletin.types';
import type { PrimaireTemplate, SymboleForme, SymboleNiveau } from './primaire.types';

const MOIS = ['Oct', 'Nov', 'Déc', 'Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil'];

const NIVEAUX: { key: SymboleNiveau; label: string }[] = [
  { key: 'tres-satisfaisant', label: 'Très satisfaisant' },
  { key: 'satisfaisant', label: 'Satisfaisant' },
  { key: 'peu-satisfaisant', label: 'Peu satisfaisant' },
  { key: 'acceptable', label: 'Acceptable' },
  { key: 'insuffisant', label: 'Insuffisant' },
  { key: 'tres-insuffisant', label: 'Très insuffisant' },
];

const FORMES: { key: SymboleForme; label: string }[] = [
  { key: 'smile', label: '☺ Sourire' },
  { key: 'circle', label: '○ Rond' },
  { key: 'D', label: 'D' },
];

const INPUT = 'w-full rounded-md border p-2 text-sm';
const LABEL = 'block text-sm font-medium text-gray-700';

interface Props {
  studentName: string;
  kind: 'secondaire' | 'primaire';
  template: BulletinTemplate | PrimaireTemplate;
  value: BulletinEntry;
  onChange: (next: BulletinEntry) => void;
  onSave: () => void;
  saving: boolean;
  message: string;
}

export default function BulletinEditor({
  studentName,
  kind,
  template,
  value,
  onChange,
  onSave,
  saving,
  message,
}: Props) {
  const set = (patch: BulletinEntry) => onChange({ ...value, ...patch });

  const scores = value.scores ?? {};
  const setScore = (key: string, patch: ScoreOverride) =>
    set({ scores: { ...scores, [key]: { ...(scores[key] ?? {}), ...patch } } });
  const num = (v: string): number | null => (v === '' ? null : Number(v));

  const common = (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={LABEL} htmlFor="be-place">
          Lieu
        </label>
        <input
          id="be-place"
          className={INPUT}
          value={value.place ?? ''}
          onChange={(e) => set({ place: e.target.value })}
        />
      </div>
      <div>
        <label className={LABEL} htmlFor="be-date">
          Date
        </label>
        <input
          id="be-date"
          className={INPUT}
          value={value.date ?? ''}
          onChange={(e) => set({ date: e.target.value })}
        />
      </div>
    </div>
  );

  let body: ReactNode;

  if (kind === 'secondaire') {
    const t = template as BulletinTemplate;
    const checked = value.decisionsChecked ?? [];
    const toggle = (dec: string) =>
      set({
        decisionsChecked: checked.includes(dec)
          ? checked.filter((x) => x !== dec)
          : [...checked, dec],
      });

    body = (
      <>
        <fieldset className="space-y-2">
          <legend className={LABEL}>Notes par matière (laisser tel quel pour garder les notes de la base)</legend>
          {t.groups
            .flatMap((g) => g.subjects)
            .map((sub) => {
              const sc = scores[sub.key] ?? {};
              return (
                <div key={sub.key} className="rounded border p-2 space-y-1">
                  <div className="text-sm font-semibold">{sub.label}</div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['mi', 'dev1', 'dev2'] as const).map((f) => (
                      <div key={f}>
                        <label className="block text-xs text-gray-600" htmlFor={`be-${sub.key}-${f}`}>
                          {f === 'mi' ? 'MI' : f === 'dev1' ? 'Dev 1' : 'Dev 2'}
                        </label>
                        <input
                          id={`be-${sub.key}-${f}`}
                          type="number"
                          min={0}
                          max={20}
                          step={0.25}
                          inputMode="decimal"
                          className={INPUT}
                          value={sc[f] ?? ''}
                          onChange={(e) => setScore(sub.key, { [f]: num(e.target.value) })}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div>
                      <label className="block text-xs text-gray-600" htmlFor={`be-${sub.key}-rang`}>
                        Rang (auto si vide)
                      </label>
                      <input
                        id={`be-${sub.key}-rang`}
                        className={INPUT}
                        value={sc.rang ?? ''}
                        onChange={(e) => setScore(sub.key, { rang: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600" htmlFor={`be-${sub.key}-app`}>
                        Appréciation
                      </label>
                      <input
                        id={`be-${sub.key}-app`}
                        className={INPUT}
                        value={sc.appreciation ?? ''}
                        onChange={(e) => setScore(sub.key, { appreciation: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
        </fieldset>

        <div>
          <label className={LABEL} htmlFor="be-conduite">
            Note de conduite (/20)
          </label>
          <input
            id="be-conduite"
            type="number"
            min={0}
            max={20}
            step={0.25}
            inputMode="decimal"
            className={INPUT}
            value={value.conduite ?? ''}
            onChange={(e) =>
              set({ conduite: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </div>

        <fieldset className="space-y-1">
          <legend className={LABEL}>Décisions du conseil des professeurs</legend>
          {t.decisions.map((dec) => (
            <label key={dec} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked.includes(dec)}
                onChange={() => toggle(dec)}
              />
              {dec}
            </label>
          ))}
        </fieldset>

        <div>
          <label className={LABEL} htmlFor="be-chef">
            Appréciation du chef d’établissement
          </label>
          <textarea
            id="be-chef"
            rows={3}
            className={INPUT}
            value={value.chefAppreciation ?? ''}
            onChange={(e) => set({ chefAppreciation: e.target.value })}
          />
        </div>
      </>
    );
  } else {
    const t = template as PrimaireTemplate;
    const attitudes = value.attitudes ?? {};
    const mensuels = value.symbolesMensuels ?? {};

    body = (
      <>
        <fieldset className="space-y-2">
          <legend className={LABEL}>Notes par épreuve (laisser tel quel pour garder les notes de la base)</legend>
          {t.epreuves.map((ep) => {
            const sc = scores[ep.key] ?? {};
            return (
              <div key={ep.key} className="rounded border p-2 space-y-1">
                <div className="text-sm font-semibold">{ep.label}</div>
                <div className="grid grid-cols-3 gap-1">
                  <div>
                    <label className="block text-xs text-gray-600" htmlFor={`be-${ep.key}-note`}>
                      Note /{sc.sur ?? ep.sur}
                    </label>
                    <input
                      id={`be-${ep.key}-note`}
                      type="number"
                      min={0}
                      step={0.25}
                      inputMode="decimal"
                      className={INPUT}
                      value={sc.note ?? ''}
                      onChange={(e) => setScore(ep.key, { note: num(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-600" htmlFor={`be-${ep.key}-app`}>
                      Appréciation
                    </label>
                    <input
                      id={`be-${ep.key}-app`}
                      className={INPUT}
                      value={sc.appreciation ?? ''}
                      onChange={(e) => setScore(ep.key, { appreciation: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={LABEL}>Attitudes</legend>
          {t.attitudes.map((a) => (
            <div key={a}>
              <label className="block text-xs text-gray-600" htmlFor={`be-att-${a}`}>
                {a}
              </label>
              <input
                id={`be-att-${a}`}
                className={INPUT}
                value={attitudes[a] ?? ''}
                onChange={(e) => set({ attitudes: { ...attitudes, [a]: e.target.value } })}
              />
            </div>
          ))}
        </fieldset>

        <div>
          <label className={LABEL} htmlFor="be-analyse">
            {t.analyseLabel}
          </label>
          <textarea
            id="be-analyse"
            rows={3}
            className={INPUT}
            value={value.analyse ?? ''}
            onChange={(e) => set({ analyse: e.target.value })}
          />
        </div>

        {t.kind === 'notes' ? (
          <div>
            <label className={LABEL} htmlFor="be-symbole">
              Symbole mérité par l’élève
            </label>
            <select
              id="be-symbole"
              className={INPUT}
              value={value.symbole ?? ''}
              onChange={(e) =>
                set({ symbole: e.target.value === '' ? undefined : (e.target.value as SymboleForme) })
              }
            >
              <option value="">— Aucun —</option>
              {FORMES.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <fieldset className="space-y-1">
            <legend className={LABEL}>Symboles mensuels</legend>
            <div className="grid grid-cols-2 gap-2">
              {MOIS.map((m) => (
                <div key={m}>
                  <label className="block text-xs text-gray-600" htmlFor={`be-m-${m}`}>
                    {m}
                  </label>
                  <select
                    id={`be-m-${m}`}
                    className={INPUT}
                    value={mensuels[m] ?? ''}
                    onChange={(e) => {
                      const next = { ...mensuels };
                      if (e.target.value === '') delete next[m];
                      else next[m] = e.target.value as SymboleNiveau;
                      set({ symbolesMensuels: next });
                    }}
                  >
                    <option value="">—</option>
                    {NIVEAUX.map((n) => (
                      <option key={n.key} value={n.key}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL} htmlFor="be-titulaire">
              Titulaire de la classe
            </label>
            <input
              id="be-titulaire"
              className={INPUT}
              value={value.titulaire ?? ''}
              onChange={(e) => set({ titulaire: e.target.value })}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="be-directeur">
              Directeur / Directrice
            </label>
            <input
              id="be-directeur"
              className={INPUT}
              value={value.directeur ?? ''}
              onChange={(e) => set({ directeur: e.target.value })}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="be-reponse">
              Réponse des parents
            </label>
            <input
              id="be-reponse"
              className={INPUT}
              value={value.reponseParents ?? ''}
              onChange={(e) => set({ reponseParents: e.target.value })}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="be-parent">
              Nom du parent
            </label>
            <input
              id="be-parent"
              className={INPUT}
              value={value.parentNom ?? ''}
              onChange={(e) => set({ parentNom: e.target.value })}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border bg-white p-4">
      <h2 className="text-lg font-semibold">Saisie du bulletin : {studentName}</h2>
      {body}
      {common}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded-md bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? 'Enregistrement...' : 'Enregistrer pour cet élève'}
      </button>
      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
