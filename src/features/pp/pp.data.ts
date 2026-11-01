// src/features/pp/pp.data.ts
// Lecture et écriture des moyennes saisies par le professeur principal (table « pp_averages »).
import type { SupabaseLike } from '@/features/bulletin/bulletin.data'
import type { PPRowKind, PPStudent, PPSubjectRow } from './pp.compute'

export interface PPClass {
  id: string
  name: string
  level: string | null
  school_year: string
  period_count: number
}

export interface PPStoredRow extends PPSubjectRow {
  period: number
}

interface DbRow {
  period: number
  subject_key: string
  kind: PPRowKind
  subject_name: string
  coef: number | string
  teacher_name: string | null
  averages: Record<string, number | null> | null
}

export async function loadPPClass(
  supabase: SupabaseLike,
  classId: string,
): Promise<{ schoolClass: PPClass; students: PPStudent[] }> {
  const [cls, stu] = await Promise.all([
    supabase
      .from('classes')
      .select('id,name,level,school_year,period_count')
      .eq('id', classId)
      .single(),
    supabase
      .from('students')
      .select('id,last_name,first_name')
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('last_name')
      .order('first_name'),
  ])
  if (cls.error) throw cls.error
  if (stu.error) throw stu.error
  const schoolClass = cls.data as PPClass
  return {
    schoolClass: { ...schoolClass, period_count: schoolClass.period_count === 2 ? 2 : 3 },
    students: (stu.data ?? []) as PPStudent[],
  }
}

export async function loadPPRows(
  supabase: SupabaseLike,
  classId: string,
): Promise<PPStoredRow[]> {
  const { data, error } = await supabase
    .from('pp_averages')
    .select('period,subject_key,kind,subject_name,coef,teacher_name,averages')
    .eq('class_id', classId)
  if (error) throw error
  return ((data ?? []) as DbRow[]).map((r) => ({
    period: Number(r.period),
    subjectKey: r.subject_key,
    kind: r.kind,
    subjectName: r.subject_name,
    coef: Number(r.coef),
    teacherName: r.teacher_name,
    averages: r.averages ?? {},
  }))
}

export async function savePPRow(
  supabase: SupabaseLike,
  userId: string,
  classId: string,
  row: PPStoredRow,
): Promise<void> {
  // On n'enregistre que les moyennes réellement saisies (une case vide = pas de note).
  const averages: Record<string, number> = {}
  for (const [studentId, value] of Object.entries(row.averages)) {
    if (typeof value === 'number' && Number.isFinite(value)) averages[studentId] = value
  }
  const { error } = await supabase.from('pp_averages').upsert(
    {
      user_id: userId,
      class_id: classId,
      period: row.period,
      subject_key: row.subjectKey,
      kind: row.kind,
      subject_name: row.subjectName,
      coef: row.coef,
      teacher_name: row.teacherName?.trim() ? row.teacherName.trim() : null,
      averages,
    },
    { onConflict: 'user_id,class_id,period,subject_key' },
  )
  if (error) throw error
}

export async function deletePPRow(
  supabase: SupabaseLike,
  classId: string,
  period: number,
  subjectKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('pp_averages')
    .delete()
    .eq('class_id', classId)
    .eq('period', period)
    .eq('subject_key', subjectKey)
  if (error) throw error
}
