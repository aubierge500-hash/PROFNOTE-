// src/features/bulletin/BulletinSheet.tsx
// Rendu d'un bulletin (HTML imprimable, A4 portrait) piloté par un BulletinTemplate.
import type { BulletinData, BulletinTemplate, ColumnKey } from './bulletin.types';
import { computeBulletin, fmt } from './bulletin.compute';
import type { ComputedRow } from './bulletin.compute';

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .bulletin-print, .bulletin-print * { visibility: visible !important; }
  .bulletin-print { position: absolute; left: 0; top: 0; width: 100%; }
  @page { size: A4 portrait; margin: 8mm; }
}`;

const TD = 'border border-black px-1 py-[3px] text-center align-middle';
const TH = 'border border-black px-1 py-1 text-center align-middle font-bold bg-gray-100';
const BOX = (checked: boolean) => (checked ? '☒' : '☐');

interface Props {
  template: BulletinTemplate;
  data: BulletinData;
}

export default function BulletinSheet({ template: t, data: d }: Props) {
  const c = computeBulletin(t, d);
  const h = t.header;
  const nbCols = t.columns.length + 1;

  const cellFor = (key: ColumnKey, row: ComputedRow): string => {
    const s = d.scores[row.def.key];
    switch (key) {
      case 'coef':
        return String(row.def.coef);
      case 'mi':
        return fmt(s?.mi);
      case 'dev1':
        return fmt(s?.dev1);
      case 'dev2':
        return fmt(s?.dev2);
      case 'moy':
        return fmt(row.moy);
      case 'mgCoef':
        return fmt(row.mgCoef);
      case 'rang':
        return s?.rang ?? '';
      case 'appreciation':
        return s?.appreciation ?? '';
    }
  };

  /** Valeur à placer dans la colonne « Coef » / « MG Coef » des lignes Conduite et Total */
  const summaryCell = (key: ColumnKey, coef: number, value: number | null) =>
    key === 'coef' ? String(coef) : key === 'mgCoef' ? fmt(value) : '';

  return (
    <div className="overflow-x-auto">
      <style>{PRINT_CSS}</style>
      <div
        className="bulletin-print mx-auto bg-white text-black text-[11px] leading-tight border-2 border-black rounded-lg p-2"
        style={{ width: 794, minHeight: 1050, fontFamily: 'Arial, Helvetica, sans-serif' }}
      >
        {/* En-tête */}
        <div className="grid grid-cols-[90px_1fr_190px] gap-2 border border-black p-2">
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
            <div className="font-bold text-[14px]">{t.title}</div>
            <div className="mt-1">ANNÉE SCOLAIRE : {d.schoolYear}</div>
            <div className="font-bold text-[13px] mt-2">{d.periodLabel}</div>
          </div>
        </div>

        {/* Identité */}
        <div className="border border-black border-t-0 p-2 space-y-1">
          <div>
            <b>Nom et Prénoms :</b> <span className="uppercase">{d.student.fullName}</span>
          </div>
          <div className="flex flex-wrap gap-x-6">
            <span>
              <b>Redoublant(e) :</b> Oui {BOX(d.student.redoublant)} Non {BOX(!d.student.redoublant)}
            </span>
            <span>
              <b>Sexe :</b> M {BOX(d.student.sex === 'M')} F {BOX(d.student.sex === 'F')}
            </span>
            <span>
              <b>N° Matricule :</b> {d.student.matricule ?? ''}
            </span>
          </div>
          <div className="flex gap-x-10">
            <span>
              <b>Classe :</b> {d.student.classe}
            </span>
            <span>
              <b>Effectif :</b> {d.student.effectif}
            </span>
          </div>
        </div>

        {/* Tableau des notes */}
        <table className="w-full border-collapse mt-1">
          <thead>
            <tr>
              <th className={TH} style={{ width: 150 }}>
                DISCIPLINES
              </th>
              {t.columns.map((col) => (
                <th
                  key={col.key}
                  className={TH}
                  style={col.key === 'appreciation' ? undefined : { width: 52 }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.groups.map((g, gi) => {
              const bilanLabel = t.groups[gi].bilanLabel;
              return (
                <GroupRows
                  key={gi}
                  rows={g.rows}
                  bilan={g.bilan}
                  bilanLabel={bilanLabel}
                  columns={t.columns.map((x) => x.key)}
                  cellFor={cellFor}
                  nbCols={nbCols}
                />
              );
            })}

            {/* Conduite */}
            <tr>
              <td className={`${TD} text-left font-bold`}>Conduite</td>
              {t.columns.map((col) => (
                <td key={col.key} className={TD}>
                  {summaryCell(col.key, t.conduiteCoef, d.conduite ?? null)}
                </td>
              ))}
            </tr>
            {/* Total */}
            <tr className="font-bold bg-gray-100">
              <td className={`${TD} text-left`}>TOTAL</td>
              {t.columns.map((col) => (
                <td key={col.key} className={TD}>
                  {summaryCell(col.key, c.totalCoef, c.total)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {/* Pied de bulletin */}
        <div className="grid grid-cols-[1.1fr_1.2fr_1fr] border border-black border-t-0">
          {/* Résultats */}
          <div className="p-2 space-y-1 border-r border-black">
            <div>
              <b>{t.averageLabel} :</b> <span className="text-[13px] font-bold">{fmt(c.moyenne)}</span>
              {t.showLowest || !t.showRappel ? <span> /20</span> : null}
            </div>
            <div>
              <b>Rang :</b> {d.rang ?? ''}
            </div>
            {t.showHighest && (
              <div>
                <b>Plus forte moyenne de la classe :</b> {fmt(d.highest)}
              </div>
            )}
            {t.showLowest && (
              <div>
                <b>Plus faible moyenne de la classe :</b> {fmt(d.lowest)}
              </div>
            )}
            {t.showRappel && d.rappel && d.rappel.length > 0 && (
              <div className="border-t border-black pt-1 mt-1">
                <div className="font-bold">Rappel des moyennes</div>
                {d.rappel.map((r) => (
                  <div key={r.label}>
                    {r.label} : {fmt(r.moy)} — Rang : {r.rang}
                  </div>
                ))}
              </div>
            )}
            {t.disciplineItems && (
              <div className="border-t border-black pt-1 mt-1">
                <div className="font-bold underline">Discipline</div>
                {t.disciplineItems.map((it) => (
                  <div key={it}>
                    {BOX(d.decisionsChecked.includes(it))} {it}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Décisions du conseil */}
          <div className="p-2 border-r border-black">
            <div className="font-bold text-center underline mb-1">Décisions du conseil des professeurs</div>
            {t.decisions.map((dec) => (
              <div key={dec}>
                {BOX(d.decisionsChecked.includes(dec))} {dec}
              </div>
            ))}
          </div>

          {/* Chef d'établissement */}
          <div className="p-2 flex flex-col">
            <div className="font-bold text-center underline mb-1">{t.chefLabel}</div>
            <div className="flex-1 italic text-center text-[13px]">{d.chefAppreciation ?? ''}</div>
            <div className="border-t border-black pt-1 mt-2 text-center font-bold">
              {t.signatureLabel}
              <div style={{ height: 54 }} />
            </div>
          </div>
        </div>

        <div className="mt-2 px-1">
          {d.place}, le {d.date}
        </div>
      </div>
    </div>
  );
}

interface GroupRowsProps {
  rows: ComputedRow[];
  bilan: number | null;
  bilanLabel?: string;
  columns: ColumnKey[];
  cellFor: (key: ColumnKey, row: ComputedRow) => string;
  nbCols: number;
}

function GroupRows({ rows, bilan, bilanLabel, columns, cellFor, nbCols }: GroupRowsProps) {
  return (
    <>
      {rows.map((row) => (
        <tr key={row.def.key}>
          <td className={`${TD} text-left font-semibold`}>{row.def.label}</td>
          {columns.map((key) => (
            <td key={key} className={`${TD} ${key === 'appreciation' ? 'text-left italic' : ''}`}>
              {cellFor(key, row)}
            </td>
          ))}
        </tr>
      ))}
      {bilanLabel && (
        <tr className="bg-gray-200 font-bold">
          <td className="border border-black px-1 py-[3px]" colSpan={nbCols}>
            {bilanLabel} : {fmt(bilan)}
          </td>
        </tr>
      )}
    </>
  );
}
