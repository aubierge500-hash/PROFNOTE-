// src/features/bulletin/PrimaireSheet.tsx
// Rendu d'un bulletin du primaire (A4 portrait, imprimable) : modèles « notes » et « compétences ».
import { fmt } from './bulletin.compute';
import { computePrimaire } from './primaire.compute';
import type {
  PrimaireData,
  PrimaireTemplate,
  SymboleForme,
  SymboleNiveau,
} from './primaire.types';

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .primaire-print, .primaire-print * { visibility: visible !important; }
  .primaire-print { position: absolute; left: 0; top: 0; width: 100%; }
  @page { size: A4 portrait; margin: 8mm; }
}`;

const TD = 'border border-black px-1 py-[3px] text-center align-middle';
const TH = 'border border-black px-1 py-1 text-center align-middle font-bold bg-gray-100';
const BOX = (c: boolean) => (c ? '☒' : '☐');
const H2 = 'font-bold underline mt-2 mb-1 text-[12px]';

const MOIS = ['Oct', 'Nov', 'Déc', 'Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil'];

const NIVEAUX: { key: SymboleNiveau; label: string; forme: SymboleForme }[] = [
  { key: 'tres-satisfaisant', label: 'Très satisfaisant', forme: 'smile' },
  { key: 'satisfaisant', label: 'Satisfaisant', forme: 'smile' },
  { key: 'peu-satisfaisant', label: 'Peu satisfaisant', forme: 'circle' },
  { key: 'acceptable', label: 'Acceptable', forme: 'circle' },
  { key: 'insuffisant', label: 'Insuffisant', forme: 'D' },
  { key: 'tres-insuffisant', label: 'Très insuffisant', forme: 'D' },
];

const FORME_CHAR: Record<SymboleForme, string> = { smile: '☺', circle: '○', D: 'D' };

interface Props {
  template: PrimaireTemplate;
  data: PrimaireData;
}

export default function PrimaireSheet({ template: t, data: d }: Props) {
  const c = computePrimaire(t, d);
  const h = t.header;
  const notes = t.kind === 'notes';

  return (
    <div className="overflow-x-auto">
      <style>{PRINT_CSS}</style>
      <div
        className="primaire-print mx-auto bg-white text-black text-[11px] leading-tight border-2 border-black rounded-lg p-2"
        style={{ width: 794, minHeight: 1050, fontFamily: 'Arial, Helvetica, sans-serif' }}
      >
        {/* En-tête */}
        <div className="grid grid-cols-[90px_1fr_200px] gap-2 border border-black p-2">
          <div className="flex items-center justify-center">
            {h.logoUrl ? (
              <img src={h.logoUrl} alt="Logo" className="max-h-20 max-w-full object-contain" />
            ) : (
              <div className="w-16 h-16 rounded-full border border-dashed border-gray-400" />
            )}
          </div>
          <div className="text-center">
            <div className="font-bold underline text-[13px]">{h.country}</div>
            {h.ministryLines.map((l) => (
              <div key={l}>{l}</div>
            ))}
            <div className="font-bold mt-1">{h.schoolName}</div>
            {h.schoolLines.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
          <div className="text-center border-l border-black pl-2 flex flex-col justify-center">
            <div className="font-bold text-[12px]">{t.title}</div>
            <div className="mt-1">ANNÉE SCOLAIRE : {d.schoolYear}</div>
            <div className="font-bold text-[13px] mt-1">{d.periodLabel}</div>
          </div>
        </div>

        {/* Identité */}
        <div className="border border-black border-t-0 p-2 flex flex-wrap gap-x-8 gap-y-1">
          <span className="basis-full">
            <b>Nom et Prénoms :</b> <span className="uppercase">{d.student.fullName}</span>
          </span>
          {d.student.sex && (
            <span>
              <b>Sexe :</b> M {BOX(d.student.sex === 'M')} F {BOX(d.student.sex === 'F')}
            </span>
          )}
          <span>
            <b>Classe :</b> {d.student.classe}
          </span>
          <span>
            <b>Effectif :</b> {d.student.effectif}
          </span>
          {d.student.matricule && (
            <span>
              <b>N° Matricule :</b> {d.student.matricule}
            </span>
          )}
        </div>

        {/* I — Connaissances */}
        <div className={H2}>I - CONNAISSANCES ET HABILETÉS</div>
        <table className="w-full border-collapse">
          <thead>
            {notes ? (
              <tr>
                <th className={TH}>Champs de formation</th>
                <th className={TH} style={{ width: 70 }}>Notes</th>
                <th className={TH} style={{ width: 50 }}>Sur</th>
                <th className={TH} style={{ width: 150 }}>Appréciations</th>
              </tr>
            ) : (
              <tr>
                <th className={TH}>Épreuves</th>
                <th className={TH} style={{ width: 90 }}>Critère minimal</th>
                <th className={TH} style={{ width: 90 }}>Note obtenue</th>
                <th className={TH} style={{ width: 60 }}>Sur</th>
                <th className={TH} style={{ width: 90 }}>Épreuve réussie</th>
              </tr>
            )}
          </thead>
          <tbody>
            {c.rows.map((r) =>
              notes ? (
                <tr key={r.def.key}>
                  <td className={`${TD} text-left`}>{r.def.label}</td>
                  <td className={TD}>{r.note === null ? '' : fmt(r.note)}</td>
                  <td className={TD}>{r.note === null ? '' : r.sur}</td>
                  <td className={`${TD} italic`}>{r.note === null ? '' : r.appreciation}</td>
                </tr>
              ) : (
                <tr key={r.def.key}>
                  <td className={`${TD} text-left`}>{r.def.label}</td>
                  <td className={TD}>{r.note === null ? '' : r.def.seuil}</td>
                  <td className={TD}>{r.note === null ? '' : fmt(r.note)}</td>
                  <td className={TD}>{r.note === null ? '' : r.sur}</td>
                  <td className={`${TD} font-bold`}>
                    {r.reussie === null ? '' : r.reussie ? 'Oui' : 'Non'}
                  </td>
                </tr>
              ),
            )}
            {notes ? (
              <tr className="font-bold bg-gray-100">
                <td className={`${TD} text-left`}>TOTAL</td>
                <td className={TD}>{fmt(c.total)}</td>
                <td className={TD}>{c.totalSur}</td>
                <td className={TD} />
              </tr>
            ) : (
              <tr className="font-bold bg-gray-100">
                <td className={`${TD} text-left`}>TOTAL</td>
                <td className={TD}>{c.totalSeuil}</td>
                <td className={TD}>{fmt(c.total)}</td>
                <td className={TD}>{c.totalSur}</td>
                <td className={TD} />
              </tr>
            )}
          </tbody>
        </table>

        {/* II — Récapitulatif */}
        <div className={H2}>II - RÉCAPITULATIF</div>
        {notes ? (
          <div className="space-y-0.5">
            <div>
              <b>Moyenne :</b> <span className="font-bold text-[13px]">{fmt(c.moyenne)}</span> sur {t.moyenneSur}
            </div>
            <div>
              <b>Rang :</b> {d.rang ?? ''} sur {d.student.effectif} élèves
            </div>
            <div>
              <b>Moyenne plus faible de la classe :</b> {fmt(d.plusFaible)}
            </div>
            <div>
              <b>Moyenne plus forte de la classe :</b> {fmt(d.plusForte)}
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            <div>
              <b>Nombre d'épreuves où la note exigée doit être atteinte :</b> {c.nbEvaluees}
            </div>
            <div>
              <b>Nombre d'épreuves où l'élève a atteint la note exigée :</b> {c.nbReussies}/{c.nbEvaluees}
            </div>
            <div>
              <b>Moyenne de l'apprenant(e) :</b> <span className="font-bold text-[13px]">{fmt(c.moyenne)}</span>
            </div>
            <div>
              <b>Plus forte moyenne :</b> {fmt(d.plusForte)} &nbsp;&nbsp; <b>Plus faible moyenne :</b>{' '}
              {fmt(d.plusFaible)}
            </div>
            <div className="border border-black p-1 mt-1">
              <b>Décision du conseil des maîtres :</b> {BOX(c.atteintSeuil)} A atteint le seuil de réussite
              &nbsp;&nbsp; {BOX(!c.atteintSeuil && c.nbEvaluees > 0)} N'a pas atteint le seuil de réussite
            </div>
          </div>
        )}

        {/* III — Attitudes */}
        <div className={H2}>III - ATTITUDES</div>
        <div className="space-y-1">
          {t.attitudes.map((a) => (
            <div key={a} className="flex gap-1">
              <b className="whitespace-nowrap">{a} :</b>
              <span className="flex-1 border-b border-dotted border-black">{d.attitudes[a] ?? ''}</span>
            </div>
          ))}
        </div>

        {/* IV — Analyse / recommandations */}
        <div className={H2}>{notes ? 'IV' : 'III bis'} - {t.analyseLabel}</div>
        <div className="border border-black p-1 italic" style={{ minHeight: 60 }}>
          {d.analyse ?? ''}
        </div>

        {/* Symboles */}
        {notes ? (
          <div className="mt-2">
            <div className="font-bold underline mb-1">Symbole mérité par l'élève</div>
            <div className="flex gap-10 justify-center">
              {(['smile', 'circle', 'D'] as SymboleForme[]).map((f) => (
                <span
                  key={f}
                  className={`inline-flex items-center justify-center w-9 h-9 text-[20px] rounded-full ${
                    d.symbole === f ? 'border-[3px] border-red-600' : 'border border-gray-300'
                  }`}
                >
                  {FORME_CHAR[f]}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <div className="font-bold underline mb-1">Symboles interprétant les résultats de l'apprenant(e)</div>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH} style={{ width: 36 }} />
                  <th className={TH}>Niveau</th>
                  {MOIS.map((m) => (
                    <th key={m} className={TH} style={{ width: 40 }}>
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NIVEAUX.map((n) => (
                  <tr key={n.key}>
                    <td className={`${TD} text-[14px]`}>{FORME_CHAR[n.forme]}</td>
                    <td className={`${TD} text-left`}>{n.label}</td>
                    {MOIS.map((m) => (
                      <td key={m} className={`${TD} font-bold`}>
                        {d.symbolesMensuels?.[m] === n.key ? '✕' : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-3 mt-3 text-center">
          <div>
            <b>{d.student.sex === 'F' ? 'La titulaire' : 'Le titulaire'} de la classe</b>
            <div className="mt-1 flex items-center justify-center" style={{ minHeight: 40 }}>
              {t.teacherSignatureUrl && (
                <img src={t.teacherSignatureUrl} alt="Signature" className="max-h-[40px] max-w-full object-contain" />
              )}
            </div>
            <div>{d.titulaire ?? ''}</div>
          </div>
          <div>
            <b>{t.chefLabel || 'Le Directeur / La Directrice'}</b>
            <div className="mt-1 flex items-center justify-center gap-2" style={{ minHeight: 40 }}>
              {(t.directorSignatureUrl || t.signatureUrl) && (
                <img
                  src={t.directorSignatureUrl || t.signatureUrl}
                  alt="Signature"
                  className="max-h-[40px] max-w-[45%] object-contain"
                />
              )}
              {t.stampUrl && (
                <img src={t.stampUrl} alt="Cachet" className="max-h-[40px] max-w-[45%] object-contain" />
              )}
            </div>
            <div>{d.directeur ?? ''}</div>
          </div>
          <div>
            <b>Réponse des parents de l'élève</b>
            <div className="mt-1 italic">{d.reponseParents ?? ''}</div>
            <div className="mt-2">
              <b>Nom, Prénoms et Signature</b>
              <div>{d.parentNom ?? ''}</div>
            </div>
          </div>
        </div>

        <div className="mt-3 px-1">
          {d.place}, le {d.date}
        </div>
      </div>
    </div>
  );
}
