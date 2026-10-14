import { useEffect, useState } from 'react';
import BulletinSheet from './BulletinSheet';
import PrimaireSheet from './PrimaireSheet';
import BulletinSettingsForm from './BulletinSettings';
import {
loadClassBulletins,
loadClasses,
type ClassBulletins,
type ClassRow,
type SupabaseLike,
} from './bulletin.data';
import type { BulletinTemplate } from './bulletin.types';
import type { PrimaireTemplate } from './primaire.types';
import {
DEFAULT_BULLETIN_SETTINGS,
normalizeBulletinSettings,
type BulletinSettings,
} from './bulletin.settings';

type AuthClient = SupabaseLike & {
auth?: {
getUser: () => Promise<{
data: { user: { id: string } | null };
error: unknown;
}>;
};
};

export default function BulletinPage({
supabase,
}: {
supabase: SupabaseLike;
}) {
const [classes, setClasses] = useState<ClassRow[]>([]);
const [classId, setClassId] = useState('');
const [period, setPeriod] = useState(1);
const [result, setResult] = useState<ClassBulletins | null>(null);
const [studentIdx, setStudentIdx] = useState(0);
const [loading, setLoading] = useState(false);
const [error, setError] = useState('');
const [showSettings, setShowSettings] = useState(false);
const [settings, setSettings] = useState<BulletinSettings>({
...DEFAULT_BULLETIN_SETTINGS,
});
const [settingsLoading, setSettingsLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [settingsMessage, setSettingsMessage] = useState('');

const authClient = supabase as AuthClient;

useEffect(() => {
let active = true;

loadClasses(supabase)
  .then((c) => {
    if (!active) return;
    setClasses(c);
    if (c[0]) setClassId(c[0].id);
  })
  .catch((e) => {
    if (active) setError(e.message ?? String(e));
  });

return () => {
  active = false;
};

}, [supabase]);

useEffect(() => {
let active = true;

async function loadSettings() {
  try {
    if (!authClient.auth) {
      throw new Error('La connexion utilisateur est indisponible.');
    }

    const { data: authData, error: authError } =
      await authClient.auth.getUser();

    if (authError) throw authError;

    const user = authData.user;
    if (!user) throw new Error('Connectez-vous pour régler vos bulletins.');

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('bulletin_settings')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (active) {
      setSettings(
        normalizeBulletinSettings(data?.bulletin_settings),
      );
    }
  } catch (e) {
    if (active) setSettingsMessage(
      `Chargement des paramètres impossible : ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  } finally {
    if (active) setSettingsLoading(false);
  }
}

loadSettings();

return () => {
  active = false;
};

}, [supabase]);

const saveSettings = async () => {
setSaving(true);
setSettingsMessage('');

try {
  if (!authClient.auth) {
    throw new Error('La connexion utilisateur est indisponible.');
  }

  const { data: authData, error: authError } =
    await authClient.auth.getUser();

  if (authError) throw authError;

  const user = authData.user;
  if (!user) throw new Error('Connectez-vous avant d’enregistrer.');

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ bulletin_settings: settings })
    .eq('id', user.id);

  if (updateError) throw updateError;

  setSettingsMessage('Paramètres enregistrés.');
} catch (e) {
  setSettingsMessage(
    `Enregistrement impossible : ${
      e instanceof Error ? e.message : String(e)
    }`,
  );
} finally {
  setSaving(false);
}

};

const cls = classes.find((c) => c.id === classId);
const periods = cls?.period_count === 2 ? [1, 2] : [1, 2, 3];

useEffect(() => {
if (!classId) {
setResult(null);
return;
}

let active = true;
setLoading(true);
setError('');
setStudentIdx(0);

loadClassBulletins(supabase, classId, period)
  .then((data) => {
    if (active) setResult(data);
  })
  .catch((e) => {
    if (active) setError(e.message ?? String(e));
  })
  .finally(() => {
    if (active) setLoading(false);
  });

return () => {
  active = false;
};

}, [supabase, classId, period]);

const list =
result?.kind === 'primaire'
? result.primaire
: result?.secondaire;

const current = list?.[studentIdx];

const applyHeaderSettings = <T extends {
header: {
country: string;
ministryLines: string[];
schoolName: string;
schoolLines: string[];
logoUrl?: string;
};
title: string;
}>(template: T): T => ({
...template,
header: {
...template.header,
country: settings.country.trim() || template.header.country,
ministryLines: settings.ministryLines.trim()
? settings.ministryLines.split('\n').map((line) => line.trim()).filter(Boolean)
: template.header.ministryLines,
schoolName: settings.schoolName.trim() || template.header.schoolName,
schoolLines: settings.schoolLines.trim()
? settings.schoolLines.split('\n').map((line) => line.trim()).filter(Boolean)
: template.header.schoolLines,
logoUrl: settings.logoUrl.trim() || template.header.logoUrl,
},
title: settings.title.trim() || template.title,
});

return (
<div className="p-3 space-y-3">
<div className="flex flex-wrap items-center gap-2">
<select
className="border rounded px-2 py-1"
value={classId}
onChange={(e) => setClassId(e.target.value)}
>
{classes.map((c) => (
<option key={c.id} value={c.id}>
{c.name} {c.level ? "(${c.level})" : ''}
</option>
))}
</select>

    <select
      className="border rounded px-2 py-1"
      value={period}
      onChange={(e) => setPeriod(Number(e.target.value))}
    >
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

    <button
      type="button"
      className="bg-blue-600 text-white rounded px-3 py-1"
      onClick={() => window.print()}
    >
      Imprimer / PDF
    </button>

    <button
      type="button"
      className="border rounded px-3 py-1"
      onClick={() => setShowSettings((value) => !value)}
    >
      {showSettings ? 'Fermer les paramètres' : 'Personnaliser le bulletin'}
    </button>
  </div>

  {showSettings && (
    <div className="space-y-2">
      {settingsLoading ? (
        <p>Chargement des paramètres...</p>
      ) : (
        <BulletinSettingsForm
          settings={settings}
          onChange={setSettings}
          onSave={saveSettings}
          saving={saving}
        />
      )}
      {settingsMessage && (
        <p className="text-sm" role="status">
          {settingsMessage}
        </p>
      )}
    </div>
  )}

  {loading && <p>Chargement…</p>}
  {error && <p className="text-red-600">Erreur : {error}</p>}
  {!loading && list?.length === 0 && (
    <p>Aucun élève dans cette classe.</p>
  )}

  {!loading && current && result && (
    <>
      {result.kind === 'primaire' ? (
        <PrimaireSheet
          template={applyHeaderSettings(
            result.template as PrimaireTemplate,
          )}
          data={current.data}
        />
      ) : (
        <BulletinSheet
          template={applyHeaderSettings(
            result.template as BulletinTemplate,
          )}
          data={current.data}
        />
      )}
    </>
  )}
</div>

);
}
