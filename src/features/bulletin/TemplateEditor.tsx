// src/features/bulletin/TemplateEditor.tsx
// Éditeur du modèle : titres, matières, coefficients, décisions, attitudes, épreuves.
import type { ReactNode } from 'react';
import type { TemplateOverride } from './bulletin.template-edit';
import type { BulletinTemplate, SubjectGroup } from './bulletin.types';
import type { EpreuveDef, PrimaireTemplate } from './primaire.types';

const INPUT = 'w-full rounded-md border p-2 text-sm';
const LABEL = 'block text-sm font-medium text-gray-700';
const SMALL_BTN = 'rounded border px-2 py-1 text-sm';

const newKey = (): string => `m${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
const toLines = (value: string): string[] => value.split('\n').map((l) => l.trim()).filter(Boolean);

interface Props {
  kind: 'secondaire' | 'primaire';
  /** modèle effectif (avec les modifications en cours) */
  template: BulletinTemplate | PrimaireTemplate;
  onChange: (patch: TemplateOverride) => void;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
  hasSaved: boolean;
  message: string;
}

export default function TemplateEditor({
  kind,
  template,
  onChange,
  onSave,
  onReset,
  saving,
  hasSaved,
  message,
}: Props) {
  let body: ReactNode;

  if (kind === 'secondaire') {
    const t = template as BulletinTemplate;
    const groups = t.groups;

    const setGroups = (next: SubjectGroup[]) => onChange({ groups: next });
    const updateGroup = (gi: number, patch: Partial<SubjectGroup>) =>
      setGroups(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));

    body = (
      <>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className={LABEL} htmlFor="te-title">
              Titre du bulletin
            </label>
            <input id="te-title" className={INPUT} value={t.title} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
          <div>
            <label className={LABEL} htmlFor="te-avg">
              Libellé de la moyenne
            </label>
            <input
              id="te-avg"
              className={INPUT}
              value={t.averageLabel}
              onChange={(e) => onChange({ averageLabel: e.target.value })}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="te-cc">
              Coefficient de la conduite
            </label>
            <input
              id="te-cc"
              type="number"
              min={0}
              step={0.5}
              inputMode="decimal"
              className={INPUT}
              value={t.conduiteCoef}
              onChange={(e) => onChange({ conduiteCoef: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="te-chef">
              Titre du chef d’établissement
            </label>
            <input id="te-chef" className={INPUT} value={t.chefLabel} onChange={(e) => onChange({ chefLabel: e.target.value })} />
          </div>
          <div>
            <label className={LABEL} htmlFor="te-sign">
              Libellé de la signature
            </label>
            <input
              id="te-sign"
              className={INPUT}
              value={t.signatureLabel}
              onChange={(e) => onChange({ signatureLabel: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="te-dec">
            Décisions du conseil (une par ligne)
          </label>
          <textarea
            id="te-dec"
            key={t.decisions.join('|')}
            rows={5}
            className={INPUT}
            defaultValue={t.decisions.join('\n')}
            onBlur={(e) => onChange({ decisions: toLines(e.target.value) })}
          />
        </div>

        <div className="space-y-3">
          <div className={LABEL}>Matières et coefficients</div>
          {groups.map((g, gi) => (
            <div key={gi} className="space-y-2 rounded border p-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-gray-600" htmlFor={`te-bilan-${gi}`}>
                    Groupe {gi + 1} : intitulé du bilan (vide = pas de ligne de bilan)
                  </label>
                  <input
                    id={`te-bilan-${gi}`}
                    className={INPUT}
                    value={g.bilanLabel ?? ''}
                    onChange={(e) => updateGroup(gi, { bilanLabel: e.target.value || undefined })}
                  />
                </div>
                <button
                  type="button"
                  className={`${SMALL_BTN} text-red-600`}
                  onClick={() => setGroups(groups.filter((_, i) => i !== gi))}
                >
                  Retirer le groupe
                </button>
              </div>

              {g.subjects.map((s, si) => (
                <div key={s.key} className="grid grid-cols-[1fr_70px_auto] items-end gap-1">
                  <div>
                    <label className="block text-xs text-gray-600" htmlFor={`te-s-${s.key}`}>
                      Matière
                    </label>
                    <input
                      id={`te-s-${s.key}`}
                      className={INPUT}
                      value={s.label}
                      onChange={(e) =>
                        updateGroup(gi, {
                          subjects: g.subjects.map((x, i) => (i === si ? { ...x, label: e.target.value } : x)),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600" htmlFor={`te-c-${s.key}`}>
                      Coef
                    </label>
                    <input
                      id={`te-c-${s.key}`}
                      type="number"
                      min={0}
                      step={0.5}
                      inputMode="decimal"
                      className={INPUT}
                      value={s.coef}
                      onChange={(e) =>
                        updateGroup(gi, {
                          subjects: g.subjects.map((x, i) =>
                            i === si ? { ...x, coef: Number(e.target.value) || 0 } : x,
                          ),
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className={`${SMALL_BTN} text-red-600`}
                    aria-label={`Retirer ${s.label}`}
                    onClick={() => updateGroup(gi, { subjects: g.subjects.filter((_, i) => i !== si) })}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                type="button"
                className={SMALL_BTN}
                onClick={() =>
                  updateGroup(gi, { subjects: [...g.subjects, { key: newKey(), label: 'Nouvelle matière', coef: 1 }] })
                }
              >
                + Ajouter une matière
              </button>
            </div>
          ))}

          <button
            type="button"
            className={SMALL_BTN}
            onClick={() =>
              setGroups([...groups, { subjects: [{ key: newKey(), label: 'Nouvelle matière', coef: 1 }] }])
            }
          >
            + Ajouter un groupe
          </button>
        </div>
      </>
    );
  } else {
    const t = template as PrimaireTemplate;
    const epreuves = t.epreuves;
    const setEpreuves = (next: EpreuveDef[]) => onChange({ epreuves: next });
    const updateEpreuve = (i: number, patch: Partial<EpreuveDef>) =>
      setEpreuves(epreuves.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

    body = (
      <>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className={LABEL} htmlFor="te-title">
              Titre du bulletin
            </label>
            <input id="te-title" className={INPUT} value={t.title} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={LABEL} htmlFor="te-analyse">
              Intitulé de la zone « recommandations »
            </label>
            <input
              id="te-analyse"
              className={INPUT}
              value={t.analyseLabel}
              onChange={(e) => onChange({ analyseLabel: e.target.value })}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="te-sur">
              Moyenne sur
            </label>
            <input
              id="te-sur"
              type="number"
              min={1}
              inputMode="decimal"
              className={INPUT}
              value={t.moyenneSur}
              onChange={(e) => onChange({ moyenneSur: Number(e.target.value) || 1 })}
            />
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="te-att">
            Rubriques « Attitudes » (une par ligne)
          </label>
          <textarea
            id="te-att"
            key={t.attitudes.join('|')}
            rows={4}
            className={INPUT}
            defaultValue={t.attitudes.join('\n')}
            onBlur={(e) => onChange({ attitudes: toLines(e.target.value) })}
          />
        </div>

        <div className="space-y-2">
          <div className={LABEL}>Épreuves</div>
          {epreuves.map((ep, i) => (
            <div
              key={ep.key}
              className={`grid items-end gap-1 ${t.kind === 'competences' ? 'grid-cols-[1fr_60px_60px_auto]' : 'grid-cols-[1fr_70px_auto]'}`}
            >
              <div>
                <label className="block text-xs text-gray-600" htmlFor={`te-e-${ep.key}`}>
                  Épreuve
                </label>
                <input
                  id={`te-e-${ep.key}`}
                  className={INPUT}
                  value={ep.label}
                  onChange={(e) => updateEpreuve(i, { label: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600" htmlFor={`te-sur-${ep.key}`}>
                  Sur
                </label>
                <input
                  id={`te-sur-${ep.key}`}
                  type="number"
                  min={1}
                  inputMode="decimal"
                  className={INPUT}
                  value={ep.sur}
                  onChange={(e) => updateEpreuve(i, { sur: Number(e.target.value) || 1 })}
                />
              </div>
              {t.kind === 'competences' && (
                <div>
                  <label className="block text-xs text-gray-600" htmlFor={`te-seuil-${ep.key}`}>
                    Seuil
                  </label>
                  <input
                    id={`te-seuil-${ep.key}`}
                    type="number"
                    min={0}
                    inputMode="decimal"
                    className={INPUT}
                    value={ep.seuil ?? ''}
                    onChange={(e) =>
                      updateEpreuve(i, { seuil: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                  />
                </div>
              )}
              <button
                type="button"
                className={`${SMALL_BTN} text-red-600`}
                aria-label={`Retirer ${ep.label}`}
                onClick={() => setEpreuves(epreuves.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className={SMALL_BTN}
            onClick={() =>
              setEpreuves([
                ...epreuves,
                { key: newKey(), label: 'Nouvelle épreuve', sur: 20, ...(t.kind === 'competences' ? { seuil: 10 } : {}) },
              ])
            }
          >
            + Ajouter une épreuve
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border bg-white p-4">
      <h2 className="text-lg font-semibold">Modifier le modèle de bulletin</h2>
      <p className="text-sm text-gray-600">
        Vos changements s’appliquent à tous les bulletins de ce modèle, pour votre compte uniquement. Une matière
        ajoutée reprend automatiquement les notes de la base si son nom est identique à celui de l’évaluation.
      </p>
      {body}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer le modèle'}
        </button>
        {hasSaved && (
          <button
            type="button"
            onClick={onReset}
            disabled={saving}
            className="rounded-md border px-4 py-2 text-red-600 disabled:opacity-50"
          >
            Revenir au modèle d’origine
          </button>
        )}
      </div>
      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
