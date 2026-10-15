// src/features/bulletin/bulletin.template-edit.ts
// Modifications du modèle de bulletin propres à chaque enseignant (matières, coefficients, titres),
// stockées dans la table Supabase « bulletin_templates ».
import type { SupabaseLike } from './bulletin.data';
import type { SubjectGroup } from './bulletin.types';
import type { EpreuveDef } from './primaire.types';

export interface TemplateOverride {
  // secondaire
  averageLabel?: string;
  chefLabel?: string;
  signatureLabel?: string;
  conduiteCoef?: number;
  decisions?: string[];
  groups?: SubjectGroup[];
  // primaire
  analyseLabel?: string;
  attitudes?: string[];
  epreuves?: EpreuveDef[];
  moyenneSur?: number;
  // commun
  title?: string;
}

export type TemplateOverrides = Record<string, TemplateOverride>;

/** Applique les modifications par-dessus un modèle (seules les clés connues du modèle sont touchées). */
export function applyTemplateOverride<T extends object>(template: T, override?: TemplateOverride): T {
  if (!override) return template;
  const out: Record<string, unknown> = { ...(template as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined && key in template) out[key] = value;
  }
  return out as T;
}

export async function loadTemplateOverrides(supabase: SupabaseLike): Promise<TemplateOverrides> {
  const { data, error } = await supabase.from('bulletin_templates').select('template_id,data');
  if (error) throw error;
  const out: TemplateOverrides = {};
  for (const row of (data ?? []) as { template_id: string; data: TemplateOverride }[]) {
    out[row.template_id] = row.data ?? {};
  }
  return out;
}

export async function saveTemplateOverride(
  supabase: SupabaseLike,
  userId: string,
  templateId: string,
  override: TemplateOverride,
): Promise<void> {
  const { error } = await supabase
    .from('bulletin_templates')
    .upsert({ user_id: userId, template_id: templateId, data: override }, { onConflict: 'user_id,template_id' });
  if (error) throw error;
}

export async function resetTemplateOverride(
  supabase: SupabaseLike,
  userId: string,
  templateId: string,
): Promise<void> {
  const { error } = await supabase
    .from('bulletin_templates')
    .delete()
    .eq('user_id', userId)
    .eq('template_id', templateId);
  if (error) throw error;
}
