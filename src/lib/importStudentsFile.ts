
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

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
  format: 'csv' | 'excel' | 'word' | 'pdf'
  headers: string[]
  warnings: string[]
}

type SupportedFormat = 'csv' | 'excel' | 'word' | 'pdf'

const COLUMN_ALIASES = {
  nom: [
    'Nom',
    'Nom de famille',
    'Nom famille',
    'Nom élève',
    'Nom eleve',
    'Lastname',
    'Last name',
    'Surname',
  ],
  prenom: [
    'Prenom',
    'Prénom',
    'Prénoms',
    'Prénom élève',
    'Prenom eleve',
    'First name',
    'Firstname',
  ],
  sexe: ['Sexe', 'Genre', 'Sex', 'Gender'],
  classe: ['Classe', 'Class', 'Niveau'],
  whatsapp: [
    'WhatsApp',
    'Whatsapp',
    'WhatsApp parent',
    'Téléphone',
    'Telephone',
    'Téléphone parent',
    'Telephone parent',
    'Tel',
    'Phone',
    'Contact',
    'Contact parent',
  ],
  observation: [
    'Observation',
    'Observations',
    'Remarque',
    'Remarques',
    'Note',
    'Commentaire',
    'Comment',
  ],
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return ''

  return String(value)
    .replace(/^\uFEFF/, '')
    .replace(/\u00a0/g, ' ')
    .trim()
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader)

  return headers.findIndex((header) =>
    normalizedAliases.includes(normalizeHeader(header)),
  )
}

function findHeaderRow(matrix: string[][]): number {
  const limit = Math.min(matrix.length, 20)
  let bestIndex = -1
  let bestScore = 0

  for (let i = 0; i < limit; i++) {
    const row = matrix[i].map(normalizeValue)

    const nomIndex = findColumnIndex(row, COLUMN_ALIASES.nom)
    const prenomIndex = findColumnIndex(row, COLUMN_ALIASES.prenom)

    if (nomIndex < 0 || prenomIndex < 0) continue

    const score = [
      nomIndex,
      prenomIndex,
      findColumnIndex(row, COLUMN_ALIASES.sexe),
      findColumnIndex(row, COLUMN_ALIASES.classe),
      findColumnIndex(row, COLUMN_ALIASES.whatsapp),
      findColumnIndex(row, COLUMN_ALIASES.observation),
    ].filter((index) => index >= 0).length

    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  return bestIndex
}

function cleanRows(rows: ImportedRow[]): ImportedRow[] {
  return rows.filter(
    (row) => Boolean(row.Nom?.trim() || row.Prenom?.trim()),
  )
}

function mapMatrixRows(
  matrix: string[][],
  headerRowIndex: number,
): { rows: ImportedRow[]; headers: string[] } {
  const headers = (matrix[headerRowIndex] ?? []).map(normalizeValue)

  const nomIndex = findColumnIndex(headers, COLUMN_ALIASES.nom)
  const prenomIndex = findColumnIndex(headers, COLUMN_ALIASES.prenom)
  const sexeIndex = findColumnIndex(headers, COLUMN_ALIASES.sexe)
  const classeIndex = findColumnIndex(headers, COLUMN_ALIASES.classe)
  const whatsappIndex = findColumnIndex(headers, COLUMN_ALIASES.whatsapp)
  const observationIndex = findColumnIndex(
    headers,
    COLUMN_ALIASES.observation,
  )

  if (nomIndex < 0 || prenomIndex < 0) {
    throw new Error(
      'Les colonnes « Nom » et « Prénom » sont obligatoires. Vérifiez les en-têtes du fichier.',
    )
  }

  const rows = matrix.slice(headerRowIndex + 1).map((cells) => ({
    Nom: normalizeValue(cells[nomIndex]),
    Prenom: normalizeValue(cells[prenomIndex]),
    Sexe: sexeIndex >= 0 ? normalizeValue(cells[sexeIndex]) : '',
    Classe: classeIndex >= 0 ? normalizeValue(cells[classeIndex]) : '',
    WhatsApp:
      whatsappIndex >= 0 ? normalizeValue(cells[whatsappIndex]) : '',
    Observation:
      observationIndex >= 0
        ? normalizeValue(cells[observationIndex])
        : '',
  }))

  return { rows: cleanRows(rows), headers }
}

function buildWarnings(headerRowIndex: number): string[] {
  return headerRowIndex > 0
    ? [`Les en-têtes ont été détectés à la ligne ${headerRowIndex + 1}.`]
    : []
}

async function parseExcel(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', raw: false })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error('Le fichier Excel ne contient aucune feuille.')
  }

  const worksheet = workbook.Sheets[firstSheetName]
  const matrix = XLSX.utils
    .sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      raw: false,
    })
    .map((row) => row.map(normalizeValue))

  if (matrix.length === 0) {
    throw new Error('Aucune donnée trouvée dans le fichier Excel.')
  }

  const headerRowIndex = findHeaderRow(matrix)

  if (headerRowIndex < 0) {
    throw new Error(
      'Colonnes « Nom » et « Prénom » introuvables dans le fichier Excel.',
    )
  }

  const mapped = mapMatrixRows(matrix, headerRowIndex)

  if (mapped.rows.length === 0) {
    throw new Error(
      'Les en-têtes Excel ont été trouvés, mais aucun élève exploitable ne suit.',
    )
  }

  return {
    rows: mapped.rows,
    format: 'excel',
    headers: mapped.headers,
    warnings: buildWarnings(headerRowIndex),
  }
}

async function parseCsv(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: 'greedy',
      delimiter: '',
      complete: (result) => {
        try {
          const matrix = result.data.map((row) =>
            row.map(normalizeValue),
          )

          if (matrix.length === 0) {
            throw new Error('Le fichier CSV est vide.')
          }

          const headerRowIndex = findHeaderRow(matrix)

          if (headerRowIndex < 0) {
            throw new Error(
              'Colonnes « Nom » et « Prénom » introuvables dans le CSV. Vérifiez la première ligne et le séparateur.',
            )
          }

          const mapped = mapMatrixRows(matrix, headerRowIndex)

          if (mapped.rows.length === 0) {
            throw new Error(
              'Les en-têtes CSV ont été trouvés, mais aucun élève exploitable ne suit.',
            )
          }

          resolve({
            rows: mapped.rows,
            format: 'csv',
            headers: mapped.headers,
            warnings: [
              ...buildWarnings(headerRowIndex),
              ...(result.errors.length
                ? ['Le CSV contient certaines lignes mal formées. Vérifiez l’aperçu avant de valider.']
                : []),
            ],
          })
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error('Impossible de lire le fichier CSV.'),
          )
        }
      },
      error: (error) => {
        reject(new Error(`Lecture CSV impossible : ${error.message}`))
      },
    })
  })
}

async function parseWord(file: File): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer })
  const document = new DOMParser().parseFromString(
    result.value,
    'text/html',
  )

  const tables = Array.from(document.querySelectorAll('table'))

  if (tables.length > 0) {
    const matrix = Array.from(tables[0].querySelectorAll('tr')).map(
      (tr) =>
        Array.from(tr.querySelectorAll('th, td')).map((cell) =>
          normalizeValue(cell.textContent),
        ),
    )

    if (matrix.length === 0) {
      throw new Error('Le tableau Word ne contient aucune ligne.')
    }

    const headerRowIndex = findHeaderRow(matrix)

    if (headerRowIndex < 0) {
      throw new Error(
        'Colonnes « Nom » et « Prénom » introuvables dans le tableau Word.',
      )
    }

    const mapped = mapMatrixRows(matrix, headerRowIndex)

    if (mapped.rows.length === 0) {
      throw new Error(
        'Le tableau Word a été lu, mais aucun élève exploitable n’a été détecté.',
      )
    }

    return {
      rows: mapped.rows,
      format: 'word',
      headers: mapped.headers,
      warnings: buildWarnings(headerRowIndex),
    }
  }

  const text = document.body.textContent ?? ''
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    throw new Error('Aucune donnée exploitable trouvée dans le document Word.')
  }

  const rows = cleanRows(parseTextLines(lines))

  if (rows.length === 0) {
    throw new Error(
      'Aucun élève détecté dans le document Word. Présentez les données en tableau avec les colonnes Nom et Prénom.',
    )
  }

  return {
    rows,
    format: 'word',
    headers: [],
    warnings: [
      'Le document Word ne contient pas de tableau reconnu. Les lignes ont été interprétées automatiquement ; vérifiez l’aperçu.',
    ],
  }
}

async function parsePDF(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const lines: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()

    const items = content.items
      .filter(
        (item): item is TextItem =>
          'str' in item && typeof item.str === 'string',
      )
      .map((item) => ({
        text: String(item.str ?? ''),
        x: Number(item.transform?.[4] ?? 0),
        y: Number(item.transform?.[5] ?? 0),
        width: Number(item.width ?? 0),
      }))
      .filter((item) => item.text.trim())

    const grouped = new Map<
      number,
      { x: number; text: string; width: number }[]
    >()

    for (const item of items) {
      const y = Math.round(item.y / 3) * 3
      if (!grouped.has(y)) grouped.set(y, [])

      grouped.get(y)!.push({
        x: item.x,
        text: item.text,
        width: item.width,
      })
    }

    const pageLines = Array.from(grouped.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, values]) => {
        const sorted = values.sort((a, b) => a.x - b.x)
        const cells: string[] = []
        let current = ''
        let previousRight: number | null = null

        for (const value of sorted) {
          const gap =
            previousRight === null ? 0 : value.x - previousRight

          if (current && gap > 18) {
            cells.push(current.trim())
            current = ''
          }

          current = current ? `${current} ${value.text}` : value.text
          previousRight =
            value.x + Math.max(value.width, value.text.length * 4)
        }

        if (current.trim()) cells.push(current.trim())
        return cells.join('\t')
      })
      .filter(Boolean)

    lines.push(...pageLines)
  }

  if (lines.length === 0) {
    throw new Error(
      'Aucun texte exploitable n’a été trouvé dans le PDF. Si le PDF est scanné comme une image, il nécessite une reconnaissance OCR.',
    )
  }

  const rows = cleanRows(parseTextLines(lines))

  if (rows.length === 0) {
    throw new Error(
      'Le PDF a été ouvert, mais aucune liste d’élèves exploitable n’a été détectée. Vérifiez la présence des noms et prénoms dans le document.',
    )
  }

  return {
    rows,
    format: 'pdf',
    headers: [],
    warnings: [
      'Le texte du PDF a été analysé. Un PDF composé uniquement de pages scannées nécessite une étape OCR.',
    ],
  }
}

function isWhatsAppValue(value: string): boolean {
  const digits = value.replace(/\D/g, '')

  return (
    digits.length === 8 ||
    digits.length === 10 ||
    (digits.startsWith('229') && digits.length >= 11)
  )
}

function normalizeGenderValue(value: string): string {
  const normalized = normalizeHeader(value)

  if (['f', 'feminin', 'female', 'fille'].includes(normalized)) {
    return 'F'
  }

  if (['m', 'masculin', 'male', 'garcon'].includes(normalized)) {
    return 'M'
  }

  return ''
}

function parseTextColumns(originalLine: string): string[] {
  if (originalLine.includes('\t')) {
    return originalLine.split(/\t+/).map((value) => value.trim())
  }

  if (originalLine.includes(';')) {
    return originalLine.split(';').map((value) => value.trim())
  }

  if (originalLine.includes(',')) {
    return originalLine.split(',').map((value) => value.trim())
  }

  return originalLine.trim().split(/\s+/).filter(Boolean)
}

function parseTextLines(lines: string[]): ImportedRow[] {
  const rows: ImportedRow[] = []

  for (const originalLine of lines) {
    const line = originalLine.trim()
    if (!line) continue

    const normalized = normalizeHeader(line)

    if (
      (normalized.includes('nom') && normalized.includes('prenom')) ||
      ['listeeleves', 'listedeclasse', 'eleves'].includes(normalized)
    ) {
      continue
    }

    const withoutNumber = line.replace(/^\d+[\s.)-]+/, '')
    const columns = parseTextColumns(withoutNumber)

    if (columns.length < 2) continue

    const working = [...columns]
    let sexe = ''
    let whatsapp = ''

    const genderIndex = working.findIndex((value) =>
      Boolean(normalizeGenderValue(value)),
    )

    if (genderIndex >= 0) {
      sexe = normalizeGenderValue(working[genderIndex])
      working.splice(genderIndex, 1)
    }

    const whatsappIndex = working.findIndex(isWhatsAppValue)

    if (whatsappIndex >= 0) {
      whatsapp = working[whatsappIndex]
      working.splice(whatsappIndex, 1)
    }

    if (working.length >= 2) {
      const nom = working[0] ?? ''
      const prenom = working.slice(1).join(' ')

      if (nom && prenom) {
        rows.push({ Nom: nom, Prenom: prenom, Sexe: sexe, WhatsApp: whatsapp })
      }
    }
  }

  return rows
}

function getKnownExtension(fileName: string): string {
  const cleanName = fileName.split(/[?#]/)[0].trim()
  const dotIndex = cleanName.lastIndexOf('.')

  if (dotIndex < 0) return ''

  const extension = cleanName.slice(dotIndex + 1).toLowerCase()
  const supported = ['csv', 'txt', 'xlsx', 'xls', 'docx', 'doc', 'pdf']

  return supported.includes(extension) ? extension : ''
}

function getFormatFromMime(mime: string): SupportedFormat | null {
  const type = mime.toLowerCase().split(';')[0].trim()

  if (type === 'application/pdf') return 'pdf'
  if (type === 'text/csv' || type === 'application/csv') return 'csv'

  if (
    type === 'text/plain' ||
    type === 'text/tab-separated-values'
  ) {
    return 'csv'
  }

  if (
    type.includes('spreadsheetml') ||
    type === 'application/vnd.ms-excel' ||
    type === 'application/x-excel' ||
    type === 'application/xls'
  ) {
    return 'excel'
  }

  if (
    type.includes('wordprocessingml') ||
    type === 'application/msword'
  ) {
    return 'word'
  }

  return null
}

async function detectFormat(file: File): Promise<SupportedFormat> {
  const extension = getKnownExtension(file.name)

  if (extension === 'doc') {
    throw new Error(
      'Le format Word .doc ancien n’est pas pris en charge. Enregistrez le document au format .docx ou .pdf.',
    )
  }

  if (extension === 'csv' || extension === 'txt') return 'csv'
  if (extension === 'xlsx' || extension === 'xls') return 'excel'
  if (extension === 'docx') return 'word'
  if (extension === 'pdf') return 'pdf'

  const mimeFormat = getFormatFromMime(file.type)
  if (mimeFormat) return mimeFormat

  // Certains sélecteurs Android fournissent un nom sans extension.
  // On examine alors la signature du fichier.
  const buffer = await file.slice(0, 8).arrayBuffer()
  const bytes = new Uint8Array(buffer)

  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'pdf'
  }

  // XLSX et DOCX sont tous les deux des archives ZIP.
  // On tente d’abord la lecture Excel, puis Word si nécessaire.
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b
  ) {
    const fullBuffer = await file.arrayBuffer()

    try {
      const workbook = XLSX.read(fullBuffer, { type: 'array' })
      if (workbook.SheetNames.length > 0) return 'excel'
    } catch {
      // Ce n’est peut-être pas un fichier Excel.
    }

    try {
      const result = await mammoth.convertToHtml({
        arrayBuffer: fullBuffer,
      })

      if (result.value.trim()) return 'word'
    } catch {
      // Le fichier ZIP n’est probablement pas un DOCX lisible.
    }
  }

  // Dernier recours : reconnaître un fichier texte/CSV sans extension.
  try {
    const sample = (await file.slice(0, 4096).text()).replace(/^\uFEFF/, '')

    const looksLikeText =
      sample.length > 0 &&
      !sample.includes('\u0000') &&
      /[\r\n,;\t]/.test(sample)

    if (looksLikeText) return 'csv'
  } catch {
    // Le contenu n’est pas lisible comme texte.
  }

  throw new Error(
    'Format du fichier impossible à identifier. Choisissez un fichier CSV, Excel (.xlsx/.xls), Word (.docx) ou PDF.',
  )
}

export async function parseStudentsFile(file: File): Promise<ImportResult> {
  if (!file) {
    throw new Error('Aucun fichier sélectionné.')
  }

  if (file.size === 0) {
    throw new Error('Le fichier sélectionné est vide.')
  }

  const format = await detectFormat(file)

  switch (format) {
    case 'csv':
      return parseCsv(file)

    case 'excel':
      return parseExcel(file)

    case 'word':
      return parseWord(file)

    case 'pdf':
      return parsePDF(file)

    default: {
      const unsupported: never = format
      throw new Error(`Format non pris en charge : ${unsupported}`)
    }
  }
}
