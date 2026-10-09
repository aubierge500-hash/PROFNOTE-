import { supabase } from './supabase'

export interface ImportedRow {
  Nom?: string
  Prenom?: string
  Sexe?: string
  Classe?: string
  WhatsApp?: string
  Observation?: string
}

export interface InvalidWhatsAppRow {
  index: number
  nom: string
  prenom: string
  valeur: string
}

function normalizeText(value?: string): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeStudentKey(value?: string): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function normalizeGender(value?: string): 'F' | 'M' | null {
  const normalized = normalizeStudentKey(value)

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

/*
 * Normalise UN numéro béninois vers +229 01XXXXXXXX.
 *
 * Cas tolérés (fréquents dans les fichiers Excel / Word / PDF) :
 *  - 8 chiffres (ancien format)            : 97000000
 *  - 10 chiffres commençant par 01         : 0197000000
 *  - indicatif 229 ou 00229, avec espaces  : +229 97 00 00 00
 *  - zéro initial perdu par Excel          : 197000000 (9 chiffres)
 *  - 9 chiffres commençant par 0           : 097000000
 *  - suffixe décimal d'une cellule numérique : 0197000000.0
 */
function normalizeSingleBeninNumber(
  raw: string
): string | null {
  const cleaned = raw.trim().replace(/\.0+$/, '')
  let digits = cleaned.replace(/\D/g, '')

  if (!digits) return null

  if (digits.startsWith('00229')) {
    digits = digits.slice(5)
  } else if (
    digits.startsWith('229') &&
    digits.length >= 11
  ) {
    digits = digits.slice(3)
  }

  let local = digits

  if (local.length === 8) {
    local = `01${local}`
  } else if (local.length === 9 && local.startsWith('1')) {
    local = `0${local}`
  } else if (local.length === 9 && local.startsWith('0')) {
    local = `01${local.slice(1)}`
  }

  if (!/^01\d{8}$/.test(local)) {
    return null
  }

  return `+229${local}`
}

/*
 * Accepte une cellule contenant un ou plusieurs numéros
 * (séparés par / ; , | ou « ou ») et retourne le premier
 * numéro valide.
 */
function normalizeBeninWhatsApp(
  value?: string
): string | null {
  const text = String(value ?? '').trim()

  if (!text) return null

  const parts = text
    .split(/[\/;,|]|\bou\b/i)
    .map((part) => part.trim())
    .filter(Boolean)

  for (const part of parts) {
    const normalized = normalizeSingleBeninNumber(part)

    if (normalized) return normalized
  }

  return null
}

/*
 * À appeler dans l'aperçu (avant « Confirmer ») pour
 * avertir l'utilisateur des numéros illisibles.
 * Ces lignes seront importées SANS numéro WhatsApp.
 */
export function findInvalidWhatsAppRows(
  rows: ImportedRow[]
): InvalidWhatsAppRow[] {
  const invalid: InvalidWhatsAppRow[] = []

  rows.forEach((row, index) => {
    const valeur = normalizeText(row.WhatsApp)

    if (!valeur) return

    if (!normalizeBeninWhatsApp(valeur)) {
      invalid.push({
        index,
        nom: normalizeText(row.Nom),
        prenom: normalizeText(row.Prenom),
        valeur
      })
    }
  })

  return invalid
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
   * 2. Numéros WhatsApp
   *
   * Un numéro illisible ne bloque PLUS l'import :
   * l'élève est importé sans numéro (voir
   * normalizeBeninWhatsApp plus bas, qui retourne null).
   * Utiliser findInvalidWhatsAppRows() dans l'aperçu
   * pour prévenir l'utilisateur.
   */

  /*
   * 3. Suppression des doublons présents dans le fichier
   */
  const uniqueRows: typeof cleanedRows = []
  const seen = new Set<string>()

  for (const row of cleanedRows) {
    const key =
      `${normalizeStudentKey(row.Nom)}|${normalizeStudentKey(
        row.Prenom
      )}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    uniqueRows.push(row)
  }

  /*
   * 4. Récupération des élèves déjà présents
   *    dans cette classe.
   */
  const { data: existingStudents, error: existingError } =
    await supabase
      .from('students')
      .select(
        'id, last_name, first_name, gender, parent_whatsapp, note'
      )
      .eq('teacher_id', teacherId)
      .eq('class_id', classId)
      .eq('is_active', true)

  if (existingError) {
    throw new Error(
      `Impossible de vérifier les élèves existants. ${getImportErrorMessage(
        existingError
      )}`
    )
  }

  /*
   * 5. Index des élèves existants.
   */
  const existingMap = new Map<
    string,
    {
      id: string
      last_name: string
      first_name: string
      gender?: string | null
      parent_whatsapp?: string | null
      note?: string | null
    }
  >()

  for (const student of existingStudents ?? []) {
    const key =
      `${normalizeStudentKey(student.last_name)}|${normalizeStudentKey(
        student.first_name
      )}`

    if (!existingMap.has(key)) {
      existingMap.set(key, student)
    }
  }

  /*
   * 6. Séparation :
   *    - nouveaux élèves → INSERT
   *    - élèves existants → UPDATE uniquement si nécessaire
   */
  const newStudents: Array<{
    teacher_id: string
    class_id: string
    last_name: string
    first_name: string
    gender: 'F' | 'M' | null
    parent_whatsapp: string | null
    note: string | null
    is_active: boolean
  }> = []

  const updates: Array<{
    id: string
    parent_whatsapp?: string
    gender?: 'F' | 'M'
    note?: string
  }> = []

  for (const row of uniqueRows) {
    const key =
      `${normalizeStudentKey(row.Nom)}|${normalizeStudentKey(
        row.Prenom
      )}`

    const existing = existingMap.get(key)

    /*
     * Élève déjà présent :
     * aucun doublon n'est créé.
     */
    if (existing) {
      const update: {
        id: string
        parent_whatsapp?: string
        gender?: 'F' | 'M'
        note?: string
      } = {
        id: existing.id
      }

      /*
       * Si un nouveau WhatsApp valide est fourni,
       * on le met à jour. Vide ou illisible dans le
       * fichier : on conserve celui déjà enregistré.
       */
      if (row.WhatsApp) {
        const normalizedWhatsApp =
          normalizeBeninWhatsApp(row.WhatsApp)

        if (
          normalizedWhatsApp &&
          normalizedWhatsApp !==
            existing.parent_whatsapp
        ) {
          update.parent_whatsapp =
            normalizedWhatsApp
        }
      }

      /*
       * Le sexe existant n'est pas écrasé par une
       * cellule vide.
       */
      const gender = normalizeGender(row.Sexe)

      if (
        gender &&
        gender !== existing.gender
      ) {
        update.gender = gender
      }

      /*
       * L'observation n'est mise à jour que si
       * une nouvelle valeur est fournie.
       */
      if (
        row.Observation &&
        row.Observation !== existing.note
      ) {
        update.note = row.Observation
      }

      if (
        update.parent_whatsapp ||
        update.gender ||
        update.note
      ) {
        updates.push(update)
      }

      continue
    }

    /*
     * Nouvel élève.
     */
    newStudents.push({
      teacher_id: teacherId,
      class_id: classId,
      last_name: row.Nom,
      first_name: row.Prenom,
      gender: normalizeGender(row.Sexe),
      parent_whatsapp:
        normalizeBeninWhatsApp(row.WhatsApp) ?? null,
      note: row.Observation || null,
      is_active: true
    })
  }

  /*
   * 7. Mise à jour des élèves existants.
   */
  for (const update of updates) {
    const payload: {
      parent_whatsapp?: string
      gender?: 'F' | 'M'
      note?: string
    } = {}

    if (update.parent_whatsapp) {
      payload.parent_whatsapp =
        update.parent_whatsapp
    }

    if (update.gender) {
      payload.gender = update.gender
    }

    if (update.note) {
      payload.note = update.note
    }

    const { error } = await supabase
      .from('students')
      .update(payload)
      .eq('id', update.id)
      .eq('teacher_id', teacherId)

    if (error) {
      throw new Error(
        `La mise à jour d'un élève a échoué. ${getImportErrorMessage(
          error
        )}`
      )
    }
  }

  /*
   * 8. Insertion des nouveaux élèves par lots.
   */
  const batchSize = 100
  let insertedCount = 0

  for (
    let start = 0;
    start < newStudents.length;
    start += batchSize
  ) {
    const batch = newStudents.slice(
      start,
      start + batchSize
    )

    const { error } = await supabase
      .from('students')
      .insert(batch)

    if (error) {
      throw new Error(
        `L'enregistrement des nouveaux élèves a échoué après ${insertedCount} élève(s). ${getImportErrorMessage(
          error
        )}`
      )
    }

    insertedCount += batch.length
  }

  /*
   * On retourne le nombre de nouveaux élèves créés.
   * Les élèves existants simplement mis à jour ne
   * sont pas comptés comme nouveaux.
   */
  return insertedCount
}
