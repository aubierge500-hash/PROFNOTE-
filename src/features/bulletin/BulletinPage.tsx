
import { useEffect, useState } from 'react';
import BulletinSheet from './BulletinSheet';
import PrimaireSheet from './PrimaireSheet';
import BulletinEditor from './BulletinEditor';
import BulletinSettingsForm, {
  type BulletinImageKey,
} from './BulletinSettings';
import {
  loadClassBulletins,
  loadClasses,
  type ClassBulletins,
  type ClassRow,
  type SupabaseLike,
} from './bulletin.data';
import {
  loadEntries,
  mergePrimaire,
  mergeSecondaire,
  saveEntry,
  type BulletinEntry,
} from './bulletin.entries';
import { BULLETIN_TEMPLATES } from './bulletin.templates';
import { PRIMAIRE_TEMPLATES } from './primaire.templates';
import type { BulletinTemplate, BulletinData } from './bulletin.types';
import type { PrimaireTemplate, PrimaireData } from './primaire.types';
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
  storage?: {
    from: (bucket: string) => {
      upload: (
        path: string,
        file: File,
        options: {
          cacheControl: string;
          upsert: boolean;
          contentType: string;
        },
      ) => Promise<{
        data: unknown;
        error: unknown;
      }>;
      getPublicUrl: (path: string) => {
        data: { publicUrl: string };
      };
    };
  };
};

const BATCH_CSS = `
@media print {
  .bulletin-batch { position: absolute !important; left: 0; top: 0; width: 100% !important; }
  .bulletin-batch .bulletin-print,
  .bulletin-batch .primaire-print {
    position: static !important;
    width: 100% !important;
    min-height: 0 !important;
    break-after: page;
    page-break-after: always;
  }
  .bulletin-batch > :last-child .bulletin-print,
  .bulletin-batch > :last-child .primaire-print {
    break-after: auto;
    page-break-after: auto;
  }
}`;

const imageLabels: Record<BulletinImageKey, string> = {
  logoUrl: 'Logo',
  stampUrl: 'Cachet',
  teacherSignatureUrl: 'Signature de l’enseignant',
  directorSignatureUrl: 'Signature du directeur',
  signatureUrl: 'Autre signature',
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
  const [uploadingKey, setUploadingKey] =
    useState<BulletinImageKey | null>(null);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [entries, setEntries] = useState<Record<string, BulletinEntry>>({});
  const [draft, setDraft] = useState<{ id: string; entry: BulletinEntry } | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [batch, setBatch] = useState(false);
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryMessage, setEntryMessage] = useState('');

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
        if (!user) {
          throw new Error('Connectez-vous pour régler vos bulletins.');
        }

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
        if (active) {
          setSettingsMessage(
            `Chargement des paramètres impossible : ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
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
      if (!user) {
        throw new Error('Connectez-vous avant d’enregistrer.');
      }

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

  const uploadImage = async (
    key: BulletinImageKey,
    file: File,
  ): Promise<void> => {
    setSettingsMessage('');

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setSettingsMessage('Format refusé. Choisissez une image PNG, JPG ou WebP.');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setSettingsMessage('Image trop volumineuse. Maximum : 3 Mo.');
      return;
    }

    setUploadingKey(key);

    try {
      if (!authClient.auth || !authClient.storage) {
        throw new Error('Le stockage des images est indisponible.');
      }

      const { data: authData, error: authError } =
        await authClient.auth.getUser();

      if (authError) throw authError;

      const user = authData.user;
      if (!user) {
        throw new Error('Connectez-vous avant d’envoyer une image.');
      }

      const extension =
        file.type === 'image/png'
          ? 'png'
          : file.type === 'image/webp'
            ? 'webp'
            : 'jpg';

      const path = `${user.id}/${key}-${Date.now()}.${extension}`;

      const { error: uploadError } = await authClient.storage
        .from('bulletin-assets')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = authClient.storage
        .from('bulletin-assets')
        .getPublicUrl(path);

      if (!publicData.publicUrl) {
        throw new Error('Impossible de récupérer le lien de l’image.');
      }

      const nextSettings: BulletinSettings = {
        ...settings,
        [key]: publicData.publicUrl,
      };

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ bulletin_settings: nextSettings })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setSettings(nextSettings);
      setSettingsMessage(
        `${imageLabels[key]} envoyé et enregistré.`,
      );
    } catch (e) {
      setSettingsMessage(
        `Envoi impossible : ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    } finally {
      setUploadingKey(null);
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

    loadClassBulletins(supabase, classId, period, templateId || undefined)
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
  }, [supabase, classId, period, templateId]);

  useEffect(() => {
    if (!classId) return;
    let active = true;
    setEntryMessage('');
    loadEntries(supabase, classId, period)
      .then((e) => {
        if (active) setEntries(e);
      })
      .catch((e) => {
        if (active) setEntryMessage(`Chargement des saisies impossible : ${e instanceof Error ? e.message : String(e)}`);
      });
    return () => {
      active = false;
    };
  }, [supabase, classId, period]);

  const primaryStudents =
    result?.kind === 'primaire' ? result.primaire ?? [] : [];

  const secondaryStudents =
    result?.kind === 'secondaire' ? result.secondaire ?? [] : [];

  const list =
    result?.kind === 'primaire'
      ? primaryStudents
      : result?.kind === 'secondaire'
        ? secondaryStudents
        : [];

  const currentRow = list[studentIdx];
  const currentId = currentRow?.student.id ?? '';
  const draftEntry = draft && draft.id === currentId ? draft.entry : undefined;
  const savedEntry = currentId ? entries[currentId] : undefined;
  const activeEntry = draftEntry ?? savedEntry;

  const baseEntry = (): BulletinEntry => {
    if (result?.kind === 'primaire' && primaryStudents[studentIdx]) {
      const d = primaryStudents[studentIdx].data as PrimaireData;
      return {
        attitudes: d.attitudes,
        analyse: d.analyse,
        symbole: d.symbole,
        symbolesMensuels: d.symbolesMensuels,
        titulaire: d.titulaire,
        directeur: d.directeur,
        reponseParents: d.reponseParents,
        parentNom: d.parentNom,
        place: d.place,
        date: d.date,
      };
    }
    if (result?.kind === 'secondaire' && secondaryStudents[studentIdx]) {
      const d = secondaryStudents[studentIdx].data as BulletinData;
      return {
        conduite: d.conduite,
        decisionsChecked: d.decisionsChecked,
        chefAppreciation: d.chefAppreciation,
        place: d.place,
        date: d.date,
      };
    }
    return {};
  };

  const editorValue: BulletinEntry = { ...baseEntry(), ...(activeEntry ?? {}) };

  const saveCurrentEntry = async () => {
    if (!currentId) return;
    setEntrySaving(true);
    setEntryMessage('');
    try {
      if (!authClient.auth) {
        throw new Error('La connexion utilisateur est indisponible.');
      }
      const { data: authData, error: authError } = await authClient.auth.getUser();
      if (authError) throw authError;
      const user = authData.user;
      if (!user) throw new Error('Connectez-vous avant d’enregistrer.');

      await saveEntry(supabase, user.id, classId, period, currentId, editorValue);
      setEntries((prev) => ({ ...prev, [currentId]: editorValue }));
      setDraft(null);
      setEntryMessage('Saisie enregistrée.');
    } catch (e) {
      setEntryMessage(
        `Enregistrement impossible : ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setEntrySaving(false);
    }
  };

  const applyHeaderSettings = <
    T extends {
      header: {
        country: string;
        ministryLines: string[];
        schoolName: string;
        schoolLines: string[];
        logoUrl?: string;
      };
      title: string;
      chefLabel?: string;
      signatureLabel?: string;
      stampUrl?: string;
      signatureUrl?: string;
      teacherSignatureUrl?: string;
      directorSignatureUrl?: string;
    },
  >(
    template: T,
  ): T => {
    const lines = (value: string): string[] =>
      value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    return {
      ...template,
      header: {
        ...template.header,
        country: settings.country.trim() || template.header.country,
        ministryLines: settings.ministryLines.trim()
          ? lines(settings.ministryLines)
          : template.header.ministryLines,
        schoolName:
          settings.schoolName.trim() || template.header.schoolName,
        schoolLines: settings.schoolLines.trim()
          ? lines(settings.schoolLines)
          : template.header.schoolLines,
        logoUrl: settings.logoUrl.trim() || template.header.logoUrl,
      },
      title: settings.title.trim() || template.title,
      chefLabel:
        settings.chefLabel.trim() &&
        settings.chefLabel !== DEFAULT_BULLETIN_SETTINGS.chefLabel
          ? settings.chefLabel.trim()
          : template.chefLabel,
      signatureLabel:
        settings.signatureLabel.trim() &&
        settings.signatureLabel !== DEFAULT_BULLETIN_SETTINGS.signatureLabel
          ? settings.signatureLabel.trim()
          : template.signatureLabel,
      stampUrl: settings.stampUrl.trim() || template.stampUrl,
      signatureUrl: settings.signatureUrl.trim() || template.signatureUrl,
      teacherSignatureUrl:
        settings.teacherSignatureUrl.trim() || template.teacherSignatureUrl,
      directorSignatureUrl:
        settings.directorSignatureUrl.trim() || template.directorSignatureUrl,
    };
  };

  const allTemplates: { id: string; name: string }[] = [
    ...BULLETIN_TEMPLATES,
    ...PRIMAIRE_TEMPLATES,
  ];

  const renderSheet = (index: number) => {
    if (result?.kind === 'primaire') {
      const row = primaryStudents[index];
      if (!row) return null;
      const entry = index === studentIdx ? activeEntry : entries[row.student.id];
      return (
        <PrimaireSheet
          key={row.student.id}
          template={applyHeaderSettings(result.template as PrimaireTemplate)}
          data={mergePrimaire(row.data as PrimaireData, entry)}
        />
      );
    }
    if (result?.kind === 'secondaire') {
      const row = secondaryStudents[index];
      if (!row) return null;
      const entry = index === studentIdx ? activeEntry : entries[row.student.id];
      return (
        <BulletinSheet
          key={row.student.id}
          template={applyHeaderSettings(result.template as BulletinTemplate)}
          data={mergeSecondaire(row.data as BulletinData, entry)}
        />
      );
    }
    return null;
  };

  return (
    <div className="p-3 space-y-3">
      <style>{BATCH_CSS}</style>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="border rounded px-2 py-1"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.level ? `(${c.level})` : ''}
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
              {cls?.period_count === 2
                ? `Semestre ${p}`
                : `Trimestre ${p}`}
            </option>
          ))}
        </select>

        <select
          className="border rounded px-2 py-1"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">Modèle automatique</option>
          {allTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {list.length > 0 && !batch && (
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
          {batch ? 'Imprimer toute la classe' : 'Imprimer / PDF'}
        </button>

        {list.length > 0 && (
          <button
            type="button"
            className="border rounded px-3 py-1"
            onClick={() => {
              setBatch((v) => !v);
              setShowEditor(false);
            }}
          >
            {batch ? 'Revenir à un élève' : 'Toute la classe'}
          </button>
        )}

        {list.length > 0 && !batch && (
          <button
            type="button"
            className="border rounded px-3 py-1"
            onClick={() => setShowEditor((v) => !v)}
          >
            {showEditor ? 'Fermer la saisie' : 'Saisir / modifier'}
          </button>
        )}

        <button
          type="button"
          className="border rounded px-3 py-1"
          onClick={() => setShowSettings((value) => !value)}
        >
          {showSettings
            ? 'Fermer les paramètres'
            : 'Personnaliser le bulletin'}
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
              uploadingKey={uploadingKey}
              onUploadImage={uploadImage}
            />
          )}

          {settingsMessage && (
            <p className="text-sm" role="status">
              {settingsMessage}
            </p>
          )}
        </div>
      )}

      {showEditor && !batch && result && currentRow && (
        <BulletinEditor
          studentName={`${currentRow.student.last_name} ${currentRow.student.first_name}`}
          kind={result.kind}
          template={result.template}
          value={editorValue}
          onChange={(next) => setDraft({ id: currentId, entry: next })}
          onSave={saveCurrentEntry}
          saving={entrySaving}
          message={entryMessage}
        />
      )}

      {loading && <p>Chargement…</p>}

      {error && (
        <p className="text-red-600">Erreur : {error}</p>
      )}

      {!loading && result && list.length === 0 && (
        <p>Aucun élève dans cette classe.</p>
      )}

      {!loading && batch && (
        <div className="bulletin-batch space-y-4">
          {list.map((_, i) => renderSheet(i))}
        </div>
      )}

      {!loading && !batch && renderSheet(studentIdx)}
    </div>
  );
      }
          
