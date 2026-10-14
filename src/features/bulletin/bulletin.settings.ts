export interface BulletinSettings {
country: string;
ministryLines: string;
schoolName: string;
schoolLines: string;
logoUrl: string;
title: string;
stampUrl: string;
signatureUrl: string;
teacherSignatureUrl: string;
directorSignatureUrl: string;
chefLabel: string;
signatureLabel: string;
}

export const DEFAULT_BULLETIN_SETTINGS: BulletinSettings = {
country: "RÉPUBLIQUE DU BÉNIN",
ministryLines: "",
schoolName: "",
schoolLines: "",
logoUrl: "",
title: "",
stampUrl: "",
signatureUrl: "",
teacherSignatureUrl: "",
directorSignatureUrl: "",
chefLabel: "Chef d’établissement",
signatureLabel: "Signature",
};

export function normalizeBulletinSettings(
value: unknown,
): BulletinSettings {
if (!value || typeof value !== "object" || Array.isArray(value)) {
return { ...DEFAULT_BULLETIN_SETTINGS };
}

const data = value as Record<string, unknown>;

const result = { ...DEFAULT_BULLETIN_SETTINGS };

for (const key of Object.keys(result) as (keyof BulletinSettings)[]) {
const item = data[key];

if (typeof item === "string") {
  result[key] = item;
}

}

return result;
}
