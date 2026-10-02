import { supabase } from './supabase'

export interface ImportedRow {
  Nom?: string
  Prenom?: string
  Sexe?: string
  Classe?: string
  WhatsApp?: string
  Observation?: string
}

function normalizeText(value?: string): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeGender(value?: string): 'F' | 'M' | null {
  const normalized = normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (!normalized) return null

  if (
    ['f', 'femme', 'feminin', 'female', 'fille'].includes(
      normalized
    )
  ) {
    return 'F'
  }

  if (
    ['m', 'homme', 'masculin', 'male', 'garcon'].includes(
      normalized
    )
  ) {
    return 'M'
  }

  return null
}

function getImportErrorMessage(error: unknown): string {
  if (!error) {
    return "Erreur inconnue lors de l'import."
  }

  if (typeof error === 'object') {
    const value = error as {
      message?: string
      details?: string
      hint?: string
      code?: string
    }

    const parts: string[] = []

    if (value.message) {
      parts.push(value.message)
    }

    if (value.details) {
      parts.push(value.details)
    }

    if (value.hint) {
      parts.push(`Indice : ${value.hint}`)
    }

    if (value.code) {
      parts.push(`Code : ${value.code}`)
    }

    if (parts.length > 0) {
      return parts.join(' — ')
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export async function insertImportedStudents(
  rows: ImportedRow[],
  teacherId: string,
  classId: string
): Promise<number> {
  if (!teacherId) {
    throw new Error(
      "Impossible d'importer les élèves : utilisateur connecté introuvable."
    )
  }

  if (!classId) {
    throw new Error(
      "Impossible d'importer les élèves : aucune classe n'est sélectionnée."
    )
  }

  /*
   * 1. Nettoyage des lignes
   */
  const cleanedRows = rows
    .map((row) => ({
      Nom: normalizeText(row.Nom),
      Prenom: normalizeText(row.Prenom),
      Sexe: normalizeText(row.Sexe),
      WhatsApp: normalizeText(row.WhatsApp),
      Observation: normalizeText(row.Observation)
    }))
    .filter(
      (row) =>
        row.Nom.length > 0 &&
        row.Prenom.length > 0
    )

  if (cleanedRows.length === 0) {
    throw new Error(
      "Aucun élève valide à importer. Les colonnes Nom et Prénom sont obligatoires."
    )
  }

  /*
   * 2. Suppression des doublons présents dans le fichier
   */
  const uniqueRows: typeof cleanedRows = []
  const seen = new Set<string>()

  for (const row of cleanedRows) {
    const key =
      `${row.Nom}|${row.Prenom}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    uniqueRows.push(row)
  }

  /*
   * 3. Construction du payload Supabase
   */
  const payload = uniqueRows.map((row) => ({
    teacher_id: teacherId,
    class_id: classId,
    last_name: row.Nom,
    first_name: row.Prenom,
    gender: normalizeGender(row.Sexe),
    parent_whatsapp: row.WhatsApp || null,
    note: row.Observation || null,
    is_active: true
  }))

  /*
   * 4. Import par lots.
   *
   * Cela évite qu'un très gros fichier provoque
   * un échec global inutile.
   */
  const batchSize = 100
  let insertedCount = 0

  for (
    let start = 0;
    start < payload.length;
    start += batchSize
  ) {
    const batch = payload.slice(
      start,
      start + batchSize
    )

    const { error } = await supabase
      .from('students')
      .insert(batch)

    if (error) {
      const message = getImportErrorMessage(error)

      throw new Error(
        `L'enregistrement des élèves a échoué après ${insertedCount} élève(s). ${message}`
      )
    }

    insertedCount += batch.length
  }

  return insertedCount
}