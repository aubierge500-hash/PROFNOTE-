
import type { BulletinSettings } from "./bulletin.settings";

export type BulletinImageKey =
  | "logoUrl"
  | "stampUrl"
  | "teacherSignatureUrl"
  | "directorSignatureUrl"
  | "signatureUrl";

interface BulletinSettingsProps {
  settings: BulletinSettings;
  onChange: (settings: BulletinSettings) => void;
  onSave: () => void;
  saving: boolean;
  uploadingKey: BulletinImageKey | null;
  onUploadImage: (
    key: BulletinImageKey,
    file: File,
  ) => Promise<void>;
}

const imageFields: {
  key: BulletinImageKey;
  label: string;
}[] = [
  { key: "logoUrl", label: "Logo de l’établissement" },
  { key: "stampUrl", label: "Cachet numérique" },
  {
    key: "teacherSignatureUrl",
    label: "Signature de l’enseignant",
  },
  {
    key: "directorSignatureUrl",
    label: "Signature du directeur",
  },
  { key: "signatureUrl", label: "Autre signature numérique" },
];

const textFields: {
  key: Exclude<keyof BulletinSettings, BulletinImageKey>;
  label: string;
  multiline?: boolean;
}[] = [
  { key: "country", label: "Pays" },
  {
    key: "ministryLines",
    label: "Ministère et directions",
    multiline: true,
  },
  { key: "schoolName", label: "Nom de l’établissement" },
  {
    key: "schoolLines",
    label: "Adresse et contacts",
    multiline: true,
  },
  { key: "title", label: "Titre du bulletin" },
  { key: "chefLabel", label: "Fonction du responsable" },
  { key: "signatureLabel", label: "Libellé de la signature" },
];

export default function BulletinSettings({
  settings,
  onChange,
  onSave,
  saving,
  uploadingKey,
  onUploadImage,
}: BulletinSettingsProps) {
  const updateText = (
    key: Exclude<keyof BulletinSettings, BulletinImageKey>,
    value: string,
  ) => {
    onChange({ ...settings, [key]: value });
  };

  const updateImageUrl = (
    key: BulletinImageKey,
    value: string,
  ) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <section className="space-y-4 rounded-lg border bg-white p-4">
      <h2 className="text-lg font-semibold">
        Personnaliser les bulletins
      </h2>

      <p className="text-sm text-gray-600">
        Modifiez les informations de votre établissement et
        choisissez vos images depuis votre téléphone.
        Formats acceptés : PNG, JPG et WebP, 3 Mo maximum
        par image.
      </p>

      {textFields.map((field) => (
        <div key={field.key} className="space-y-1">
          <label
            htmlFor={`bulletin-${field.key}`}
            className="block text-sm font-medium text-gray-700"
          >
            {field.label}
          </label>

          {field.multiline ? (
            <textarea
              id={`bulletin-${field.key}`}
              value={settings[field.key]}
              onChange={(event) =>
                updateText(field.key, event.target.value)
              }
              rows={3}
              className="w-full rounded-md border p-2 text-sm"
            />
          ) : (
            <input
              id={`bulletin-${field.key}`}
              type="text"
              value={settings[field.key]}
              onChange={(event) =>
                updateText(field.key, event.target.value)
              }
              className="w-full rounded-md border p-2 text-sm"
            />
          )}
        </div>
      ))}

      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold">Images du bulletin</h3>

        {imageFields.map((field) => (
          <div
            key={field.key}
            className="space-y-2 rounded-md border p-3"
          >
            <label
              htmlFor={`bulletin-file-${field.key}`}
              className="block text-sm font-medium text-gray-700"
            >
              {field.label}
            </label>

            <input
              id={`bulletin-file-${field.key}`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploadingKey !== null}
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  void onUploadImage(field.key, file);
                }

                event.currentTarget.value = "";
              }}
              className="block w-full text-sm"
            />

            {uploadingKey === field.key && (
              <p className="text-sm text-blue-700">
                Envoi et enregistrement en cours...
              </p>
            )}

            {settings[field.key] && (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">
                  Aperçu de l’image
                </p>

                <img
                  src={settings[field.key]}
                  alt={field.label}
                  className="max-h-32 max-w-full rounded border object-contain"
                />

                <button
                  type="button"
                  onClick={() =>
                    updateImageUrl(field.key, "")
                  }
                  disabled={uploadingKey !== null}
                  className="text-sm text-red-600 underline disabled:opacity-50"
                >
                  Retirer cette image
                </button>
              </div>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer text-gray-600">
                Ou utiliser un lien d’image existant
              </summary>

              <input
                type="url"
                value={settings[field.key]}
                onChange={(event) =>
                  updateImageUrl(field.key, event.target.value)
                }
                placeholder="https://..."
                className="mt-2 w-full rounded-md border p-2"
              />
            </details>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={saving || uploadingKey !== null}
        className="rounded-md bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving
          ? "Enregistrement..."
          : "Enregistrer les paramètres"}
      </button>
    </section>
  );
}
