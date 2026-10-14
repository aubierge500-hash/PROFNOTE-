// src/features/bulletin/BulletinPage.tsx
// Page « Bulletins » : choisir classe + période, voir chaque élève, imprimer / PDF.
// Usage : <BulletinPage supabase={supabase} />   (supabase = ton client existant)
import { useEffect, useState } from 'react';
import BulletinSheet from './BulletinSheet';
import PrimaireSheet from './PrimaireSheet';
import {
  loadClassBulletins,
  loadClasses,
  type ClassBulletins,
  type ClassRow,
  type SupabaseLike,
} from './bulletin.data';
import type { BulletinTemplate } from './bulletin.types';
import type { PrimaireTemplate } from './primaire.types';

export default function BulletinPage({ supabase }: { supabase: SupabaseLike }) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState('');
  const [period, setPeriod] = useState(1);
  const [result, setResult] = useState<ClassBulletins | null>(null);
  const [studentIdx, setStudentIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadClasses(supabase)
      .then((c) => {
        setClasses(c);
        if (c[0]) setClassId(c[0].id);
      })
      .catch((e) => setError(e.message ?? String(e)));
  }, [supabase]);

  const cls = classes.find((c) => c.id === classId);
  const periods = cls?.period_count === 2 ? [1, 2] : [1, 2, 3];

  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    setError('');
    setStudentIdx(0);
    loadClassBulletins(supabase, classId, period)
      .then(setResult)
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [supabase, classId, period]);

  const list = result?.kind === 'primaire' ? result.primaire : result?.secondaire;
  const current = list?.[studentIdx];

  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="border rounded px-2 py-1" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.level ? `(${c.level})` : ''}
            </option>
          ))}
        </select>
        <select className="border rounded px-2 py-1" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
          {periods.map((p) => (
            <option key={p} value={p}>
              {cls?.period_count === 2 ? `Semestre ${p}` : `Trimestre ${p}`}
            </option>
          ))}
        </select>
        {list && list.length > 0 && (
          <select
            className="border rounded px-2 py-1"
            value={studentIdx}
            onChange={(e) => setStudentIdx(Number(e.target.value))}
          >
            {list.map((r, i) => (
              <option key={r.student.id} value={i}>
                {r.student.last_name} {r.student.first_name}
              </option>
            ))}
          </select>
        )}
        <button className="bg-blue-600 text-white rounded px-3 py-1" onClick={() => window.print()}>
          Imprimer / PDF
        </button>
      </div>

      {loading && <p>Chargement…</p>}
      {error && <p className="text-red-600">Erreur : {error}</p>}
      {!loading && list?.length === 0 && <p>Aucun élève dans cette classe.</p>}

      {!loading && current && result && (
        <>
          {result.kind === 'primaire' ? (
            <PrimaireSheet template={result.template as PrimaireTemplate} data={(current as any).data} />
          ) : (
            <BulletinSheet template={result.template as BulletinTemplate} data={(current as any).data} />
          )}
        </>
      )}
    </div>
  );
}
