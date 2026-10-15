
import { useEffect, useState } from 'react';
import BulletinSheet from './BulletinSheet';
import PrimaireSheet from './PrimaireSheet';
import BulletinEditor from './BulletinEditor';
import TemplateEditor from './TemplateEditor';
import {
  applyTemplateOverride,
  loadTemplateOverrides,
  resetTemplateOverride,
  saveTemplateOverride,
  type TemplateOverride,
  type TemplateOverrides,
} from './bulletin.template-edit';
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
  diffScores,
  finalizePrimaire,
  finalizeSecondaire,
  loadEntries,
  overlayScores,
  saveEntry,
  type ScoreOverride,
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
  const [overrides, setOverrides] = useState<TemplateOverrides>({});
  const [overridesReady, setOverridesReady] = useState(false);
  const [tplDraft, setTplDraft] = useState<TemplateOverride | null>(null);
  const [showTplEditor, setShowTplEditor] = useState(false);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplMessage, setTplMessage] = useState('');

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
    let active = true;
    loadTemplateOverrides(supabase)
      .then((o) => {
        if (active) setOverrides(o);
      })
      .catch(() => {
        /* table absente ou hors ligne : on garde les modèles d'origine */
      })
      .finally(() => {
        if (active) setOverridesReady(true);
      });
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!classId || !overridesReady) {
      setResult(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError('');
    setStudentIdx(0);

    loadClassBulletins(supabase, classId, period, templateId || undefined, overrides)
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
  }, [supabase, classId, period, templateId, overrides, overridesReady]);

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
        scores: d.scores,
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
        scores: d.scores,
        conduite: d.conduite,
        decisionsChecked: d.decisionsChecked,
        chefAppreciation: d.chefAppreciation,
        place: d.place,
        date: d.date,
      };
    }
    return {};
  };

  const base = baseEntry();
  const baseScores: Record<string, ScoreOverride> = base.scores ?? {};
  const editorValue: BulletinEntry = {
    ...base,
    ...(activeEntry ?? {}),
    scores: overlayScores(baseScores, activeEntry?.scores),
  };

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

      const toSave: BulletinEntry = {
        ...editorValue,
        scores: diffScores(baseScores, editorValue.scores),
      };
      await saveEntry(supabase, user.id, classId, period, currentId, toSave);
      setEntries((prev) => ({ ...prev, [currentId]: toSave }));
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

  const activeTemplateId = result?.template.id ?? '';
  const savedOverride: TemplateOverride | undefined = overrides[activeTemplateId];

  const effectiveTemplate = (
    template: BulletinTemplate | PrimaireTemplate,
  ): BulletinTemplate | PrimaireTemplate =>
    applyTemplateOverride(applyHeaderSettings(template), {
      ...(savedOverride ?? {}),
      ...(tplDraft ?? {}),
    });

  const saveTemplate = async () => {
    if (!activeTemplateId) return;
    setTplSaving(true);
    setTplMessage('');
    try {
      if (!authClient.auth) {
        throw new Error('La connexion utilisateur est indisponible.');
      }
      const { data: authData, error: authError } = await authClient.auth.getUser();
      if (authError) throw authError;
      const user = authData.user;
      if (!user) throw new Error('Connectez-vous avant d’enregistrer.');

      const merged: TemplateOverride = { ...(savedOverride ?? {}), ...(tplDraft ?? {}) };
      await saveTemplateOverride(supabase, user.id, activeTemplateId, merged);
      setTplDraft(null);
      setOverrides((prev) => ({ ...prev, [activeTemplateId]: merged }));
      setTplMessage('Modèle enregistré. Les rangs sont recalculés.');
    } catch (e) {
      setTplMessage(`Enregistrement impossible : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTplSaving(false);
    }
  };

  const resetTemplate = async () => {
    if (!activeTemplateId) return;
    setTplSaving(true);
    setTplMessage('');
    try {
      if (!authClient.auth) {
        throw new Error('La connexion utilisateur est indisponible.');
      }
      const { data: authData, error: authError } = await authClient.auth.getUser();
      if (authError) throw authError;
      const user = authData.user;
      if (!user) throw new Error('Connectez-vous avant de continuer.');

      await resetTemplateOverride(supabase, user.id, activeTemplateId);
      setTplDraft(null);
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[activeTemplateId];
        return next;
      });
      setTplMessage('Modèle d’origine rétabli.');
    } catch (e) {
      setTplMessage(`Opération impossible : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTplSaving(false);
    }
  };

  const allTemplates: { id: string; name: string }[] = [
    ...BULLETIN_TEMPLATES,
    ...PRIMAIRE_TEMPLATES,
  ];

  // saisies de la base + brouillon en cours pour l'élève affiché
  const entriesView: Record<string, BulletinEntry> =
    currentId && draftEntry ? { ...entries, [currentId]: draftEntry } : entries;

  // moyennes, rangs, plus forte / plus faible moyenne recalculés avec les notes saisies à la main
  const tplNow = result ? effectiveTemplate(result.template) : null;
  const finalPrimaire =
    result?.kind === 'primaire' && tplNow
      ? finalizePrimaire(tplNow as PrimaireTemplate, primaryStudents as { student: { id: string }; data: PrimaireData }[], entriesView)
      : null;
  const finalSecondaire =
    result?.kind === 'secondaire' && tplNow
      ? finalizeSecondaire(tplNow as BulletinTemplate, secondaryStudents as { student: { id: string }; data: BulletinData }[], entriesView)
      : null;

  const renderSheet = (index: number) => {
    if (result?.kind === 'primaire' && tplNow && finalPrimaire) {
      const row = primaryStudents[index];
      const data = row ? finalPrimaire.get(row.student.id) : undefined;
      if (!row || !data) return null;
      return <PrimaireSheet key={row.student.id} template={tplNow as PrimaireTemplate} data={data} />;
    }
    if (result?.kind === 'secondaire' && tplNow && finalSecondaire) {
      const row = secondaryStudents[index];
      const data = row ? finalSecondaire.get(row.student.id) : undefined;
      if (!row || !data) return null;
      return <BulletinSheet key={row.student.id} template={tplNow as BulletinTemplate} data={data} />;
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

        {list.length > 0 && !batch && (
          <button
            type="button"
            className="border rounded px-3 py-1"
            onClick={() => setShowTplEditor((v) => !v)}
          >
            {showTplEditor ? 'Fermer le modèle' : 'Modifier le modèle'}
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

      {showTplEditor && !batch && result && (
        <TemplateEditor
          kind={result.kind}
          template={effectiveTemplate(result.template)}
          onChange={(patch) => setTplDraft((prev) => ({ ...(prev ?? {}), ...patch }))}
          onSave={saveTemplate}
          onReset={resetTemplate}
          saving={tplSaving}
          hasSaved={Boolean(savedOverride)}
          message={tplMessage}
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
