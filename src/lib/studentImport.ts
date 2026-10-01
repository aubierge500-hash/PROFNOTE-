import { supabase } from './supabase'

export interface ImportedRow {
  Nom?: string
  Prenom?: string
  Sexe?: string
  Classe?: string
  WhatsApp?: string
  Observation?: string
}

function normalizeGender(value?: string): 'F' | 'M' | null {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  if (!normalized) return null

  if (
    ['f', 'femme', 'feminin', 'female'].includes(normalized)
  ) {
    return 'F'
  }

  if (
    ['m', 'homme', 'masculin', 'male'].includes(normalized)
  ) {
    return 'M'
  }

  return null
}

export async function insertImportedStudents(
  rows: ImportedRow[],
  teacherId: string,
  classId: string
): Promise<number> {
  const payload = rows
    .filter(
      (r) =>
        r.Nom?.trim() &&
        r.Prenom?.trim()
    )
    .map((r) => ({
      teacher_id: teacherId,
      class_id: classId,

      last_name: String(r.Nom).trim(),

      first_name: String(r.Prenom).trim(),

      gender: normalizeGender(r.Sexe),

      parent_whatsapp:
        r.WhatsApp?.trim() || null,

      note:
        r.Observation?.trim() || null
    }))

  if (payload.length === 0) {
    return 0
  }

  const { error } = await supabase
    .from('students')
    .insert(payload)

  if (error) {
    throw error
  }

  return payload.length
}