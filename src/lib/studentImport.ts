import { supabase } from './supabase'

export interface ImportedRow {
  Nom?: string
  Prenom?: string
  Sexe?: string
  Classe?: string
  WhatsApp?: string
  Observation?: string
}

export async function insertImportedStudents(
  rows: ImportedRow[],
  teacherId: string,
  classId: string
): Promise<number> {
  const payload = rows
    .filter((r) => r.Nom || r.Prenom)
    .map((r) => ({
      teacher_id: teacherId,
      class_id: classId,
      last_name: (r.Nom ?? '').toString().trim(),
      first_name: (r.Prenom ?? '').toString().trim(),
      gender: (r.Sexe ?? '').toString().trim().toUpperCase().startsWith('F') ? 'F' : (r.Sexe ? 'M' : null),
      parent_whatsapp: r.WhatsApp ? String(r.WhatsApp).trim() : null,
      note: r.Observation ?? null
    }))

  if (payload.length === 0) return 0

  const { error } = await supabase.from('students').insert(payload)
  if (error) throw error

  return payload.length
}
