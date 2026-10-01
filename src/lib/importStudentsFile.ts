import * as XLSX from 'xlsx'
import Papa from 'papaparse'
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
    .replace(/[\s_-]+/g, '')
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
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

function findHeaderRow(matrix: string[][]): number {
  const limit = Math.min(matrix.length, 10)

  let bestIndex = -1
  let bestScore = 0

  for (let i = 0; i < limit; i++) {
    const row = matrix[i].map(normalizeValue)

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
        (item): item is any =>
          'str' in item
      )
      .map((item: any) => ({
        text: String(
          item.str ?? ''
        ),

        x: Number(
          item.transform?.[4] ?? 0
        ),

        y: Number(
          item.transform?.[5] ?? 0
        )
      }))

    const grouped =
      new Map<
        number,
        { x: number; text: string }[]
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
          text: item.text
        })
    }

    lines.push(
      ...Array.from(
        grouped.entries()
      )
        .sort(
          (a, b) => b[0] - a[0]
        )
        .map(([, values]) =>
          values
            .sort(
              (a, b) => a.x - b.x
            )
            .map((v) => v.text)
            .join(' ')
            .trim()
        )
        .filter(Boolean)
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

function parseTextLines(
  lines: string[]
): ImportedRow[] {
  const rows: ImportedRow[] = []

  for (const originalLine of lines) {
    const line =
      originalLine
        .replace(/\s+/g, ' ')
        .trim()

    if (!line) continue

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
      normalized === 'listedeclasse'
    ) {
      continue
    }

    const withoutNumber =
      line.replace(
        /^\d+[\s.)-]+/,
        ''
      )

    const columns =
      withoutNumber
        .split(/\t+/)
        .map((v) => v.trim())
        .filter(Boolean)

    if (columns.length >= 2) {
      rows.push({
        Nom: columns[0] ?? '',
        Prenom: columns[1] ?? '',
        Sexe: columns[2] ?? ''
      })

      continue
    }

    const parts =
      withoutNumber
        .split(/\s+/)
        .filter(Boolean)

    if (parts.length < 2) {
      continue
    }

    const possibleGender =
      normalizeHeader(
        parts[parts.length - 1]
      )

    let sexe = ''

    if (
      ['f', 'feminin', 'female'].includes(
        possibleGender
      )
    ) {
      sexe = 'F'
      parts.pop()
    } else if (
      ['m', 'masculin', 'male'].includes(
        possibleGender
      )
    ) {
      sexe = 'M'
      parts.pop()
    }

    const nom =
      parts.shift() ?? ''

    const prenom =
      parts.join(' ')

    if (nom && prenom) {
      rows.push({
        Nom: nom,
        Prenom: prenom,
        Sexe: sexe
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