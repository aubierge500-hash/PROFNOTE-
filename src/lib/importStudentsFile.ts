import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'

export interface ImportedRow {
  Nom?: string
  Prenom?: string
  Sexe?: string
  Classe?: string
  WhatsApp?: string
  Observation?: string
}

export interface ImportResult {
  rows: ImportedRow[]
  format: 'excel' | 'word' | 'pdf'
  headers: string[]
  warnings: string[]
}

/* =========================================================
   NORMALISATION
========================================================= */

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, '')
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim()
}

function findColumn(
  headers: string[],
  aliases: string[]
): string | undefined {
  const normalizedAliases = aliases.map(normalizeHeader)

  return headers.find((header) =>
    normalizedAliases.includes(normalizeHeader(header))
  )
}

/* =========================================================
   ALIAS DES COLONNES
========================================================= */

const COLUMN_ALIASES = {
  nom: [
    'Nom',
    'NOM',
    'Nom de famille',
    'Nom élève',
    'Nom eleve'
  ],

  prenom: [
    'Prenom',
    'Prénom',
    'PRENOM',
    'PRÉNOM',
    'Prénoms',
    'Prenoms',
    'Prénom élève',
    'Prenom eleve'
  ],

  sexe: [
    'Sexe',
    'SEXE',
    'Genre'
  ],

  classe: [
    'Classe',
    'CLASSE',
    'Class',
    'Niveau'
  ],

  whatsapp: [
    'WhatsApp',
    'Whatsapp',
    'WhatsApp parent',
    'Téléphone',
    'Telephone',
    'Téléphone parent',
    'Telephone parent',
    'Tel',
    'Contact'
  ],

  observation: [
    'Observation',
    'Observations',
    'Remarque',
    'Remarques'
  ]
}

/* =========================================================
   EXCEL
========================================================= */

async function parseExcel(
  file: File
): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()

  const workbook = XLSX.read(buffer, {
    type: 'array',
    raw: false
  })

  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error(
      'Le fichier Excel ne contient aucune feuille.'
    )
  }

  const worksheet = workbook.Sheets[firstSheetName]

  const rawRows =
    XLSX.utils.sheet_to_json<Record<string, unknown>>(
      worksheet,
      {
        defval: '',
        raw: false
      }
    )

  if (rawRows.length === 0) {
    throw new Error(
      'Aucune donnée trouvée dans le fichier Excel.'
    )
  }

  const headers = Object.keys(rawRows[0])

  const nomColumn = findColumn(
    headers,
    COLUMN_ALIASES.nom
  )

  const prenomColumn = findColumn(
    headers,
    COLUMN_ALIASES.prenom
  )

  const sexeColumn = findColumn(
    headers,
    COLUMN_ALIASES.sexe
  )

  const classeColumn = findColumn(
    headers,
    COLUMN_ALIASES.classe
  )

  const whatsappColumn = findColumn(
    headers,
    COLUMN_ALIASES.whatsapp
  )

  const observationColumn = findColumn(
    headers,
    COLUMN_ALIASES.observation
  )

  if (!nomColumn && !prenomColumn) {
    throw new Error(
      'Les colonnes "Nom" et "Prénom" sont introuvables dans le fichier Excel.'
    )
  }

  const rows: ImportedRow[] = rawRows.map((row) => ({
    Nom: nomColumn
      ? normalizeValue(row[nomColumn])
      : '',

    Prenom: prenomColumn
      ? normalizeValue(row[prenomColumn])
      : '',

    Sexe: sexeColumn
      ? normalizeValue(row[sexeColumn])
      : '',

    Classe: classeColumn
      ? normalizeValue(row[classeColumn])
      : '',

    WhatsApp: whatsappColumn
      ? normalizeValue(row[whatsappColumn])
      : '',

    Observation: observationColumn
      ? normalizeValue(row[observationColumn])
      : ''
  }))

  return {
    rows,
    format: 'excel',
    headers,
    warnings: []
  }
}

/* =========================================================
   WORD DOCX
========================================================= */

async function parseWord(
  file: File
): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer()

  const result = await mammoth.convertToHtml({
    arrayBuffer
  })

  const html = result.value

  const parser = new DOMParser()
  const document = parser.parseFromString(
    html,
    'text/html'
  )

  const tables = Array.from(
    document.querySelectorAll('table')
  )

  const warnings: string[] = []

  /*
   * PRIORITÉ :
   * Si le document contient un tableau,
   * on l'utilise directement.
   */

  if (tables.length > 0) {
    const table = tables[0]

    const tableRows = Array.from(
      table.querySelectorAll('tr')
    )

    if (tableRows.length === 0) {
      throw new Error(
        'Le tableau Word ne contient aucune ligne.'
      )
    }

    const matrix = tableRows.map((tr) =>
      Array.from(tr.querySelectorAll('th, td')).map(
        (cell) => normalizeValue(cell.textContent)
      )
    )

    const headers = matrix[0] ?? []

    const nomIndex = findColumnIndex(
      headers,
      COLUMN_ALIASES.nom
    )

    const prenomIndex = findColumnIndex(
      headers,
      COLUMN_ALIASES.prenom
    )

    const sexeIndex = findColumnIndex(
      headers,
      COLUMN_ALIASES.sexe
    )

    const classeIndex = findColumnIndex(
      headers,
      COLUMN_ALIASES.classe
    )

    const whatsappIndex = findColumnIndex(
      headers,
      COLUMN_ALIASES.whatsapp
    )

    const observationIndex = findColumnIndex(
      headers,
      COLUMN_ALIASES.observation
    )

    if (
      nomIndex === -1 &&
      prenomIndex === -1
    ) {
      throw new Error(
        'Impossible de trouver les colonnes Nom et Prénom dans le tableau Word.'
      )
    }

    const rows: ImportedRow[] = matrix
      .slice(1)
      .map((cells) => ({
        Nom:
          nomIndex >= 0
            ? normalizeValue(cells[nomIndex])
            : '',

        Prenom:
          prenomIndex >= 0
            ? normalizeValue(cells[prenomIndex])
            : '',

        Sexe:
          sexeIndex >= 0
            ? normalizeValue(cells[sexeIndex])
            : '',

        Classe:
          classeIndex >= 0
            ? normalizeValue(cells[classeIndex])
            : '',

        WhatsApp:
          whatsappIndex >= 0
            ? normalizeValue(cells[whatsappIndex])
            : '',

        Observation:
          observationIndex >= 0
            ? normalizeValue(cells[observationIndex])
            : ''
      }))

    return {
      rows: cleanRows(rows),
      format: 'word',
      headers,
      warnings
    }
  }

  /*
   * Aucun tableau.
   *
   * On tente alors une extraction ligne par ligne.
   */

  const text = document.body.textContent ?? ''

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    throw new Error(
      'Aucune donnée exploitable trouvée dans le document Word.'
    )
  }

  warnings.push(
    'Le document Word ne contient pas de tableau. Les données ont été interprétées ligne par ligne.'
  )

  const rows = parseTextLines(lines)

  return {
    rows: cleanRows(rows),
    format: 'word',
    headers: [],
    warnings
  }
}

/* =========================================================
   PDF
========================================================= */

async function parsePDF(
  file: File
): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()

  const pdf = await pdfjsLib.getDocument({
    data: buffer
  }).promise

  const lines: string[] = []

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {
    const page = await pdf.getPage(pageNumber)

    const content =
      await page.getTextContent()

    const items = content.items
      .filter(
        (item): item is any =>
          'str' in item
      )
      .map((item: any) => ({
        text: String(item.str ?? ''),
        x: Number(item.transform?.[4] ?? 0),
        y: Number(item.transform?.[5] ?? 0)
      }))

    /*
     * Regroupement approximatif des éléments
     * appartenant à la même ligne.
     */

    const grouped = new Map<
      number,
      { x: number; text: string }[]
    >()

    for (const item of items) {
      const y = Math.round(item.y / 3) * 3

      if (!grouped.has(y)) {
        grouped.set(y, [])
      }

      grouped.get(y)!.push({
        x: item.x,
        text: item.text
      })
    }

    const pageLines = Array.from(
      grouped.entries()
    )
      .sort((a, b) => b[0] - a[0])
      .map(([, values]) =>
        values
          .sort((a, b) => a.x - b.x)
          .map((v) => v.text)
          .join(' ')
          .trim()
      )
      .filter(Boolean)

    lines.push(...pageLines)
  }

  if (lines.length === 0) {
    throw new Error(
      'Aucun texte exploitable n’a été trouvé dans le PDF. Il peut s’agir d’un PDF scanné.'
    )
  }

  const rows = parseTextLines(lines)

  if (rows.length === 0) {
    throw new Error(
      'Le PDF a été lu, mais aucune liste d’élèves exploitable n’a été détectée.'
    )
  }

  return {
    rows: cleanRows(rows),
    format: 'pdf',
    headers: [],
    warnings: [
      'Le PDF a été analysé à partir de son texte. Un PDF scanné nécessitera une étape OCR.'
    ]
  }
}

/* =========================================================
   OUTILS WORD / PDF
========================================================= */

function findColumnIndex(
  headers: string[],
  aliases: string[]
): number {
  const normalizedAliases =
    aliases.map(normalizeHeader)

  return headers.findIndex((header) =>
    normalizedAliases.includes(
      normalizeHeader(header)
    )
  )
}

/**
 * Interprétation simple de lignes texte.
 *
 * Exemple :
 *
 * ADJOVI    Grâce        F
 * AHOUANSOU David        M
 *
 * ou :
 *
 * 1 ADJOVI Grâce F
 * 2 AHOUANSOU David M
 */
function parseTextLines(
  lines: string[]
): ImportedRow[] {
  const rows: ImportedRow[] = []

  for (const originalLine of lines) {
    const line = originalLine
      .replace(/\s+/g, ' ')
      .trim()

    if (!line) continue

    /*
     * Ignore les titres et en-têtes.
     */
    const normalized = normalizeHeader(line)

    if (
      normalized.includes('nom') &&
      normalized.includes('prenom')
    ) {
      continue
    }

    if (
      normalized === 'listeeleves' ||
      normalized === 'listedeclasse'
    ) {
      continue
    }

    /*
     * Supprime éventuellement le numéro
     * au début de la ligne.
     */
    const withoutNumber = line.replace(
      /^\d+[\s.)-]+/,
      ''
    )

    /*
     * On tente de séparer par tabulation
     * lorsque le document conserve les colonnes.
     */
    const columns = withoutNumber
      .split(/\t+/)
      .map((v) => v.trim())
      .filter(Boolean)

    if (columns.length >= 2) {
      const [nom, prenom, sexe] = columns

      rows.push({
        Nom: nom ?? '',
        Prenom: prenom ?? '',
        Sexe: sexe ?? ''
      })

      continue
    }

    /*
     * Sinon on utilise les espaces.
     *
     * Cette méthode est volontairement prudente :
     * elle ne crée une ligne que si elle semble
     * contenir au minimum un nom + un prénom.
     */
    const parts = withoutNumber
      .split(/\s+/)
      .filter(Boolean)

    if (parts.length >= 2) {
      const last = parts[parts.length - 1]

      const possibleGender =
        normalizeHeader(last)

      let sexe = ''

      if (
        possibleGender === 'f' ||
        possibleGender === 'feminin'
      ) {
        sexe = 'F'
        parts.pop()
      } else if (
        possibleGender === 'm' ||
        possibleGender === 'masculin'
      ) {
        sexe = 'M'
        parts.pop()
      }

      const nom = parts.shift() ?? ''
      const prenom = parts.join(' ')

      if (nom && prenom) {
        rows.push({
          Nom: nom,
          Prenom: prenom,
          Sexe: sexe
        })
      }
    }
  }

  return rows
}

function cleanRows(
  rows: ImportedRow[]
): ImportedRow[] {
  return rows.filter(
    (row) =>
      Boolean(
        row.Nom?.trim() ||
        row.Prenom?.trim()
      )
  )
}

/* =========================================================
   FONCTION PRINCIPALE
========================================================= */

export async function parseStudentsFile(
  file: File
): Promise<ImportResult> {
  const extension =
    file.name
      .split('.')
      .pop()
      ?.toLowerCase()

  switch (extension) {
    case 'xlsx':
    case 'xls':
      return parseExcel(file)

    case 'docx':
      return parseWord(file)

    case 'pdf':
      return parsePDF(file)

    default:
      throw new Error(
        'Format non pris en charge. Utilisez Excel (.xlsx/.xls), Word (.docx) ou PDF (.pdf).'
      )
  }
}