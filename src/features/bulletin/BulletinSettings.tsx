import type { BulletinSettings } from "./bulletin.settings";

interface BulletinSettingsProps {
  settings: BulletinSettings;
  onChange: (settings: BulletinSettings) => void;
  onSave: () => void;
  saving: boolean;
}

export default function BulletinSettings({
  settings,
  onChange,
  onSave,
  saving,
}: BulletinSettingsProps) {
  const update = (key: keyof BulletinSettings, value: string) => {
    onChange({ ...settings, [key]: value });
  };

  const fields: {
    key: keyof BulletinSettings;
    label: string;
    placeholder?: string;
    multiline?: boolean;
  }[] = [
    { key: "country", label: "Pays" },
    { key: "ministryLines", label: "Ministère et directions", multiline: true },
    { key: "schoolName", label: "Nom de l’établissement" },
    { key: "schoolLines", label: "Adresse et contacts", multiline: true },
    { key: "title", label: "Titre du bulletin" },
    { key: "logoUrl", label: "Lien du logo", placeholder: "https://..." },
    { key: "stampUrl", label: "Lien du cachet numérique", placeholder: "https://..." },
    { key: "teacherSignatureUrl", label: "Lien de la signature de l’enseignant", placeholder: "https://..." },
    { key: "directorSignatureUrl", label: "Lien de la signature du directeur", placeholder: "https://..." },
    { key: "signatureUrl", label: "Autre signature numérique", placeholder: "https://..." },
    { key: "chefLabel", label: "Fonction du responsable" },
    { key: "signatureLabel", label: "Libellé de la signature" },
  ];

  return (
    <section className="space-y-4 rounded-lg border bg-white p-4">
      <h2 className="text-lg font-semibold">
        Personnaliser les bulletins
      </h2>

      <p className="text-sm text-gray-600">
        Modifiez les informations de votre établissement.
        Les liens des images doivent être accessibles.
      </p>

      {fields.map((field) => (
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
                update(field.key, event.target.value)
              }
              rows={3}
              className="w-full rounded-md border p-2 text-sm"
            />
          ) : (
            <input
              id={`bulletin-${field.key}`}
              type="text"
              value={settings[field.key]}
              placeholder={field.placeholder ?? ""}
              onChange={(event) =>
                update(field.key, event.target.value)
              }
              className="w-full rounded-md border p-2 text-sm"
            />
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded-md bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? "Enregistrement..." : "Enregistrer les paramètres"}
      </button>
    </section>
  );
}
