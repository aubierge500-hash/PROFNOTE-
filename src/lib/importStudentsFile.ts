
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
  format: 'excel' | 'word' | 'pdf'
  headers: string[]
  warnings: string[]
}

const COLUMN_ALIASES = {
  nom: [
    'Nom',
    'Nom de famille',
    'Nom famille',
    'Nom élève',
    'Nom eleve',
    'Lastname',
    'Last name',
    'Surname'
  ],

  prenom: [
    'Prenom',
    'Prénom',
    'Prénoms',
    'Prénom élève',
    'Prenom eleve',
    'First name',
    'Firstname'
  ],

  sexe: [
    'Sexe',
    'Genre',
    'Sex',
    'Gender'
  ],

  classe: [
    'Classe',
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
    'Phone',
    'Contact',
    'Contact parent'
  ],

  observation: [
    'Observation',
    'Observations',
    'Remarque',
    'Remarques',
    'Note',
    'Commentaire',
    'Comment'
  ]
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
    .replace(/\u00a0/g, ' ')
    .trim()
}

function findColumnIndex(
  headers: string[],
  aliases: string[]
): number {
  const normalizedAliases = aliases.map(normalizeHeader)

  return headers.findIndex((header) =>
    normalizedAliases.includes(normalizeHeader(header))
  )
}

/**
 * Détecte la ligne des en-têtes.
 * Les colonnes Nom et Prénom sont obligatoires :
 * une ligne contenant seulement l'une d'elles ne doit
 * jamais être considérée comme la ligne des en-têtes.
 */
function findHeaderRow(matrix: string[][]): number {
  const limit = Math.min(matrix.length, 15)

  let bestIndex = -1
  let bestScore = 0

  for (let i = 0; i < limit; i++) {
    const row = matrix[i].map(normalizeValue)

    const hasNom =
      findColumnIndex(row, COLUMN_ALIASES.nom) >= 0

    const hasPrenom =
      findColumnIndex(row, COLUMN_ALIASES.prenom) >= 0

    if (!hasNom || !hasPrenom) {
      continue
    }

    const score = [
      findColumnIndex(row, COLUMN_ALIASES.nom),
      findColumnIndex(row, COLUMN_ALIASES.prenom),
      findColumnIndex(row, COLUMN_ALIASES.sexe),
      findColumnIndex(row, COLUMN_ALIASES.classe),
      findColumnIndex(row, COLUMN_ALIASES.whatsapp),
      findColumnIndex(row, COLUMN_ALIASES.observation)
    ].filter((index) => index >= 0).length

    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  return bestIndex
}

function mapMatrixRows(
  matrix: string[][],
  headerRowIndex: number
): {
  rows: ImportedRow[]
  headers: string[]
} {
  const headers = (matrix[headerRowIndex] ?? []).map(normalizeValue)

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

  if (nomIndex < 0 || prenomIndex < 0) {
    throw new Error(
      'Les colonnes « Nom » et « Prénom » sont obligatoires et doivent être présentes dans le fichier.'
    )
  }

  const rows = matrix
    .slice(headerRowIndex + 1)
    .map((cells) => ({
      Nom: normalizeValue(cells[nomIndex]),

      Prenom: normalizeValue(
        cells[prenomIndex]
      ),

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
    headers
  }
}

async function parseExcel(
  file: File
): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()

  const workbook = XLSX.read(buffer, {
    type: 'array',
    raw: false
  })

  const firstSheetName =
    workbook.SheetNames[0]

  if (!firstSheetName) {
    throw new Error(
      'Le fichier Excel ne contient aucune feuille.'
    )
  }

  const worksheet =
    workbook.Sheets[firstSheetName]

  const matrix =
    XLSX.utils
      .sheet_to_json<unknown[]>(
        worksheet,
        {
          header: 1,
          defval: '',
          raw: false
        }
      )
      .map((row) =>
        row.map(normalizeValue)
      )

  if (matrix.length === 0) {
    throw new Error(
      'Aucune donnée trouvée dans le fichier Excel.'
    )
  }

  const headerRowIndex =
    findHeaderRow(matrix)

  if (headerRowIndex < 0) {
    throw new Error(
      'Impossible de détecter la ligne d’en-têtes. Vérifiez que le fichier contient les colonnes Nom et Prénom.'
    )
  }

  const mapped =
    mapMatrixRows(
      matrix,
      headerRowIndex
    )

  return {
    rows: mapped.rows,
    format: 'excel',
    headers: mapped.headers,
    warnings:
      headerRowIndex > 0
        ? [
            `Les en-têtes ont été détectés à la ligne ${
              headerRowIndex + 1
            }.`
          ]
        : []
  }
}

async function parseCsv(
  file: File
): Promise<ImportResult> {
  return new Promise(
    (resolve, reject) => {
      Papa.parse<string[]>(
        file,
        {
          header: false,
          skipEmptyLines: true,

          complete: (result) => {
            try {
              const matrix =
                result.data.map((row) =>
                  row.map(normalizeValue)
                )

              if (matrix.length === 0) {
                throw new Error(
                  'Le fichier CSV est vide.'
                )
              }

              const headerRowIndex =
                findHeaderRow(matrix)

              if (headerRowIndex < 0) {
                throw new Error(
                  'Impossible de détecter les colonnes Nom et Prénom dans le fichier CSV.'
                )
              }

              const mapped =
                mapMatrixRows(
                  matrix,
                  headerRowIndex
                )

              resolve({
                rows: mapped.rows,
                format: 'excel',
                headers: mapped.headers,
                warnings:
                  headerRowIndex > 0
                    ? [
                        `Les en-têtes ont été détectés à la ligne ${
                          headerRowIndex + 1
                        }.`
                      ]
                    : []
              })
            } catch (error) {
              reject(error)
            }
          },

          error: (error) =>
            reject(
              new Error(
                `Lecture CSV impossible : ${error.message}`
              )
            )
        }
      )
    }
  )
}

async function parseWord(
  file: File
): Promise<ImportResult> {
  const arrayBuffer =
    await file.arrayBuffer()

  const result =
    await mammoth.convertToHtml({
      arrayBuffer
    })

  const document =
    new DOMParser().parseFromString(
      result.value,
      'text/html'
    )

  const tables =
    Array.from(
      document.querySelectorAll('table')
    )

  const warnings: string[] = []

  if (tables.length > 0) {
    const tableRows =
      Array.from(
        tables[0].querySelectorAll('tr')
      )

    const matrix =
      tableRows.map((tr) =>
        Array.from(
          tr.querySelectorAll('th, td')
        ).map((cell) =>
          normalizeValue(
            cell.textContent
          )
        )
      )

    if (matrix.length === 0) {
      throw new Error(
        'Le tableau Word ne contient aucune ligne.'
      )
    }

    const headerRowIndex =
      findHeaderRow(matrix)

    if (headerRowIndex < 0) {
      throw new Error(
        'Impossible de détecter les colonnes Nom et Prénom dans le tableau Word.'
      )
    }

    const mapped =
      mapMatrixRows(
        matrix,
        headerRowIndex
      )

    if (headerRowIndex > 0) {
      warnings.push(
        `Les en-têtes ont été détectés à la ligne ${
          headerRowIndex + 1
        } du tableau Word.`
      )
    }

    return {
      rows: mapped.rows,
      format: 'word',
      headers: mapped.headers,
      warnings
    }
  }

  const text =
    document.body.textContent ?? ''

  const lines =
    text
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

  return {
    rows: cleanRows(
      parseTextLines(lines)
    ),
    format: 'word',
    headers: [],
    warnings
  }
}

async function parsePDF(
  file: File
): Promise<ImportResult> {
  const buffer =
    await file.arrayBuffer()

  const pdf =
    await pdfjsLib.getDocument({
      data: buffer
    }).promise

  const lines: string[] = []

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {
    const page =
      await pdf.getPage(pageNumber)

    const content =
      await page.getTextContent()

    const items = content.items
      .filter(
        (item): item is TextItem =>
          'str' in item &&
          typeof item.str === 'string'
      )
      .map((item) => ({
        text: String(item.str ?? ''),
        x: Number(item.transform?.[4] ?? 0),
        y: Number(item.transform?.[5] ?? 0),
        width: Number(item.width ?? 0)
      }))
      .filter((item) => item.text.trim())

    const grouped =
      new Map<
        number,
        {
          x: number
          text: string
          width: number
        }[]
      >()

    for (const item of items) {
      const y =
        Math.round(item.y / 3) * 3

      if (!grouped.has(y)) {
        grouped.set(y, [])
      }

      grouped
        .get(y)!
        .push({
          x: item.x,
          text: item.text,
          width: item.width
        })
    }

    const pageLines =
      Array.from(
        grouped.entries()
      )
        .sort(
          (a, b) => b[0] - a[0]
        )
        .map(([, values]) => {
          const sorted =
            values.sort(
              (a, b) => a.x - b.x
            )

          const cells: string[] = []

          let current = ''

          let previousRight: number | null =
            null

          for (const value of sorted) {
            const gap =
              previousRight === null
                ? 0
                : value.x - previousRight

            if (
              current &&
              gap > 18
            ) {
              cells.push(
                current.trim()
              )

              current = ''
            }

            current = current
              ? `${current} ${value.text}`
              : value.text

            previousRight =
              value.x +
              Math.max(
                value.width,
                value.text.length * 4
              )
          }

          if (current.trim()) {
            cells.push(
              current.trim()
            )
          }

          return cells.join('\t')
        })
        .filter(Boolean)

    lines.push(
      ...pageLines
    )
  }

  if (lines.length === 0) {
    throw new Error(
      'Aucun texte exploitable n’a été trouvé dans le PDF. Il peut s’agir d’un PDF scanné.'
    )
  }

  const rows =
    parseTextLines(lines)

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

function isWhatsAppValue(value: string): boolean {
  const digits = value.replace(/\D/g, '')

  if (!digits) {
    return false
  }

  if (
    digits.length === 8 ||
    digits.length === 10 ||
    (digits.startsWith('229') && digits.length >= 11)
  ) {
    return true
  }

  return false
}

function normalizeGenderValue(value: string): string {
  const normalized =
    normalizeHeader(value)

  if (
    ['f', 'feminin', 'female', 'fille']
      .includes(normalized)
  ) {
    return 'F'
  }

  if (
    ['m', 'masculin', 'male', 'garcon']
      .includes(normalized)
  ) {
    return 'M'
  }

  return ''
}

function parseTextColumns(
  originalLine: string
): string[] {
  if (originalLine.includes('\t')) {
    return originalLine
      .split(/\t+/)
      .map((value) => value.trim())
      .filter(Boolean)
  }

  if (originalLine.includes(';')) {
    return originalLine
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean)
  }

  if (originalLine.includes(',')) {
    return originalLine
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }

  return originalLine
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function parseTextLines(
  lines: string[]
): ImportedRow[] {
  const rows: ImportedRow[] = []

  for (const originalLine of lines) {
    const line =
      originalLine
        .replace(/\s+/g, ' ')
        .trim()

    if (!line) {
      continue
    }

    const normalized =
      normalizeHeader(line)

    if (
      normalized.includes('nom') &&
      normalized.includes('prenom')
    ) {
      continue
    }

    if (
      normalized === 'listeeleves' ||
      normalized === 'listedeclasse' ||
      normalized === 'eleves'
    ) {
      continue
    }

    const withoutNumber =
      line.replace(
        /^\d+[\s.)-]+/,
        ''
      )

    const columns =
      parseTextColumns(
        originalLine
      )

    if (columns.length >= 2) {
      const working = [
        ...columns
      ]

      let sexe = ''
      let whatsapp = ''

      const genderIndex =
        working.findIndex(
          (value) =>
            Boolean(
              normalizeGenderValue(value)
            )
        )

      if (genderIndex >= 0) {
        sexe =
          normalizeGenderValue(
            working[genderIndex]
          )

        working.splice(
          genderIndex,
          1
        )
      }

      const whatsappIndex =
        working.findIndex(
          (value) =>
            isWhatsAppValue(value)
        )

      if (whatsappIndex >= 0) {
        whatsapp =
          working[whatsappIndex]

        working.splice(
          whatsappIndex,
          1
        )
      }

      if (working.length >= 2) {
        const nom =
          working[0] ?? ''

        const prenom =
          working
            .slice(1)
            .join(' ')

        if (nom && prenom) {
          rows.push({
            Nom: nom,
            Prenom: prenom,
            Sexe: sexe,
            WhatsApp: whatsapp
          })

          continue
        }
      }
    }

    const parts =
      withoutNumber
        .split(/\s+/)
        .filter(Boolean)

    if (parts.length < 2) {
      continue
    }

    let sexe = ''
    let whatsapp = ''

    const genderIndex =
      parts.findIndex(
        (value) =>
          Boolean(
            normalizeGenderValue(value)
          )
      )

    if (genderIndex >= 0) {
      sexe =
        normalizeGenderValue(
          parts[genderIndex]
        )

      parts.splice(
        genderIndex,
        1
      )
    }

    const whatsappIndex =
      parts.findIndex(
        (value) =>
          isWhatsAppValue(value)
      )

    if (whatsappIndex >= 0) {
      whatsapp =
        parts[whatsappIndex]

      parts.splice(
        whatsappIndex,
        1
      )
    }

    const nom =
      parts.shift() ?? ''

    const prenom =
      parts.join(' ')

    if (nom && prenom) {
      rows.push({
        Nom: nom,
        Prenom: prenom,
        Sexe: sexe,
        WhatsApp: whatsapp
      })
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

export async function parseStudentsFile(
  file: File
): Promise<ImportResult> {
  const extension =
    file.name
      .split('.')
      .pop()
      ?.toLowerCase()

  switch (extension) {
    case 'csv':
      return parseCsv(file)

    case 'xlsx':
    case 'xls':
      return parseExcel(file)

    case 'docx':
      return parseWord(file)

    case 'pdf':
      return parsePDF(file)

    default:
      throw new Error(
        'Format non pris en charge. Utilisez Excel (.xlsx/.xls), CSV (.csv), Word (.docx) ou PDF (.pdf).'
      )
  }
}
 