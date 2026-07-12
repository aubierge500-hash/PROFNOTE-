// Types alignés sur supabase/schema.sql — à régénérer avec `supabase gen types typescript`
// une fois le projet lié (supabase link) pour rester synchronisé avec la base réelle.

export type EvaluationType = 'interrogation' | 'devoir' | 'composition' | 'examen'
export type ScanStatus = 'pending' | 'validated' | 'rejected' | 'ambiguous'
export type ExportType = 'excel' | 'pdf' | 'bulletin'

export interface Profile {
  id: string
  full_name: string
  email: string
  phone: string | null
  school_name: string | null
  role: 'teacher' | 'admin'
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface SchoolClass {
  id: string
  teacher_id: string
  name: string
  level: string | null
  school_year: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface Student {
  id: string
  teacher_id: string
  class_id: string
  last_name: string
  first_name: string
  gender: 'M' | 'F' | null
  parent_whatsapp: string | null
  note: string | null
  matricule: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Evaluation {
  id: string
  teacher_id: string
  class_id: string
  title: string
  type: EvaluationType
  subject: string
  eval_date: string
  coefficient: number
  max_score: number
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface Grade {
  id: string
  teacher_id: string
  evaluation_id: string
  student_id: string
  score: number | null
  is_absent: boolean
  source: 'manual' | 'scan'
  scan_history_id: string | null
  created_at: string
  updated_at: string
}

export interface ScanHistoryEntry {
  id: string
  teacher_id: string
  evaluation_id: string | null
  image_url: string | null
  detected_name_raw: string | null
  detected_score_raw: string | null
  matched_student_id: string | null
  match_confidence: number | null
  match_candidates: { student_id: string; score: number }[] | null
  status: ScanStatus
  validated_by: string | null
  created_at: string
}

export interface StudentAverage {
  student_id: string
  class_id: string
  teacher_id: string
  average: number | null
  nb_notes: number
}

export interface StudentRanking extends StudentAverage {
  rank: number
}

export interface EvaluationStats {
  evaluation_id: string
  class_id: string
  teacher_id: string
  class_average: number | null
  best_score: number | null
  lowest_score: number | null
  nb_graded: number
  nb_absent: number
}

// Placeholder générique — remplacer par le type généré par la CLI Supabase
export type Database = any
