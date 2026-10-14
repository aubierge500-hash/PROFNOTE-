// src/features/bulletin/bulletin.entries.ts
// Saisies manuelles par élève et par période (conduite, décisions, appréciations…),
// stockées dans la table Supabase « bulletin_entries ».
import type { SupabaseLike } from './bulletin.data';
import type { BulletinData } from './bulletin.types';
import type { PrimaireData, SymboleForme, SymboleNiveau } from './primaire.types';

export interface BulletinEntry {
  // secondaire
  conduite?: number | null;
  decisionsChecked?: string[];
  chefAppreciation?: string;
  // primaire
  attitudes?: Record<string, string>;
  analyse?: string;
  symbole?: SymboleForme;
  symbolesMensuels?: Record<string, SymboleNiveau>;
  titulaire?: string;
  directeur?: string;
  reponseParents?: string;
  parentNom?: string;
  // commun
  place?: string;
  date?: string;
}

export function mergeSecondaire(d: BulletinData, e?: BulletinEntry): BulletinData {
  if (!e) return d;
  return {
    ...d,
    conduite: e.conduite !== undefined ? e.conduite : d.conduite,
    decisionsChecked: e.decisionsChecked ?? d.decisionsChecked,
    chefAppreciation: e.chefAppreciation ?? d.chefAppreciation,
    place: e.place ?? d.place,
    date: e.date ?? d.date,
  };
}

export function mergePrimaire(d: PrimaireData, e?: BulletinEntry): PrimaireData {
  if (!e) return d;
  return {
    ...d,
    attitudes: e.attitudes ?? d.attitudes,
    analyse: e.analyse ?? d.analyse,
    symbole: e.symbole ?? d.symbole,
    symbolesMensuels: e.symbolesMensuels ?? d.symbolesMensuels,
    titulaire: e.titulaire ?? d.titulaire,
    directeur: e.directeur ?? d.directeur,
    reponseParents: e.reponseParents ?? d.reponseParents,
    parentNom: e.parentNom ?? d.parentNom,
    place: e.place ?? d.place,
    date: e.date ?? d.date,
  };
}

export async function loadEntries(
  supabase: SupabaseLike,
  classId: string,
  period: number,
): Promise<Record<string, BulletinEntry>> {
  const { data, error } = await supabase
    .from('bulletin_entries')
    .select('student_id,data')
    .eq('class_id', classId)
    .eq('period', period);
  if (error) throw error;
  const out: Record<string, BulletinEntry> = {};
  for (const row of (data ?? []) as { student_id: string; data: BulletinEntry }[]) {
    out[row.student_id] = row.data ?? {};
  }
  return out;
}

export async function saveEntry(
  supabase: SupabaseLike,
  userId: string,
  classId: string,
  period: number,
  studentId: string,
  entry: BulletinEntry,
): Promise<void> {
  const { error } = await supabase.from('bulletin_entries').upsert(
    { user_id: userId, class_id: classId, student_id: studentId, period, data: entry },
    { onConflict: 'user_id,student_id,period' },
  );
  if (error) throw error;
}
