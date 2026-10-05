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
    'Nom', 'Nom de famille', 'Nom famille', 'Nom élève', 'Nom eleve',
    'Lastname', 'Last name', 'Surname'
  ],
  prenom: [
    'Prenom', 'Prénom', 'Prénoms', 'Prénom élève', 'Prenom eleve',
    'First name', 'Firstname'
  ],
  sexe: ['Sexe', 'Genre', 'Sex', 'Gender'],
  classe: ['Classe', 'Class', 'Niveau'],
  whatsapp: [
    'WhatsApp', 'Whatsapp', 'WhatsApp parent', 'Téléphone', 'Telephone',
    'Téléphone parent', 'Telephone parent', 'Tel', 'Phone', 'Contact',
    'Contact parent'
  ],
  observation: [
    'Observation', 'Observations', 'Remarque', 'Remarques', 'Note',
    'Commentaire', 'Comment'
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
  if (value === null || value === undefined) return ''
  return String(value).replace(/\u00a0/g, ' ').trim()
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader)
  return headers.findIndex((header) =>
    normalizedAliases.includes(normalizeHeader(header))
  )
}

function findHeaderRow(matrix: string[][]): number {
  const limit = Math.min(matrix.length, 15)
  let bestIndex = -1
  let bestScore = 0

  for (let i = 0; i < limit; i++) {
    const row = matrix[i].map(normalizeValue)
    const hasNom = findColumnIndex(row, COLUMN_ALIASES.nom) >= 0
    const hasPrenom = findColumnIndex(row, COLUMN_ALIASES.prenom) >= 0

    if (!hasNom || !hasPrenom) continue

    const score = [
      COLUMN_ALIASES.nom,
      COLUMN_ALIASES.prenom,
      COLUMN_ALIASES.sexe,
      COLUMN_ALIASES.classe,
      COLUMN_ALIASES.whatsapp,
      COLUMN_ALIASES.observation
    ].filter((aliases) => findColumnIndex(row, aliases) >= 0).length

    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  return bestIndex
}

function mapMatrixRows( matrix: string[][], headerRowIndex: number ): { rows: ImportedRow[]; headers: string[] } {
  const headers = (matrix[headerRowIndex] ?? []).map(normalizeValue)

  const nomIndex = findColumnIndex(headers, COLUMN_ALIASES.nom)
  const prenomIndex = findColumnIndex(headers, COLUMN_ALIASES.prenom)
  const sexeIndex = findColumnIndex(headers, COLUMN_ALIASES.sexe)
  const classeIndex = findColumnIndex(headers, COLUMN_ALIASES.classe)
  const whatsappIndex = findColumnIndex(headers, COLUMN_ALIASES.whatsapp)
  const observationIndex = findColumnIndex(headers, COLUMN_ALIASES.observation)

  if (nomIndex < 0 || prenomIndex < 0) {
    throw new Error(
      'Les colonnes « Nom » et « Prénom » sont obligatoires et doivent être présentes dans le fichier.'
    )
  }

  const rows = matrix.slice(headerRowIndex + 1).map((cells) => ({
    Nom: normalizeValue(cells[nomIndex]),
    Prenom: normalizeValue(cells[prenomIndex]),
    Sexe: sexeIndex >= 0 ? normalizeValue(cells[sexeIndex]) : '',
    Classe: classeIndex >= 0 ? normalizeValue(cells[classeIndex]) : '',
    WhatsApp: whatsappIndex >= 0 ? normalizeValue(cells[whatsappIndex]) : '',
    Observation: observationIndex >= 0 ? normalizeValue(cells[observationIndex]) : ''
  }))

  return { rows: cleanRows(rows), headers }
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
      raw: false
    })
    .map((row) => row.map(normalizeValue))

  if (!matrix.length) {
    throw new Error('Aucune donnée trouvée dans le fichier Excel.')
  }

  const headerRowIndex = findHeaderRow(matrix)
  if (headerRowIndex < 0) {
    throw new Error(
      'Impossible de détecter la ligne d’en-têtes. Vérifiez que le fichier contient les colonnes Nom et Prénom.'
    )
  }

  const mapped = mapMatrixRows(matrix, headerRowIndex)

  return {
    rows: mapped.rows,
    format: 'excel',
    headers: mapped.headers,
    warnings: headerRowIndex > 0
      ? [`Les en-têtes ont été détectés à la ligne ${headerRowIndex + 1}.`]
      : []
  }
}

async function parseCsv(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (result) => {
        try {
          const matrix = result.data.map((row) => row.map(normalizeValue))
          if (!matrix.length) throw new Error('Le fichier CSV est vide.')

          const headerRowIndex = findHeaderRow(matrix)
          if (headerRowIndex < 0) {
            throw new Error(
              'Impossible de détecter les colonnes Nom et Prénom dans le fichier CSV.'
            )
          }

          const mapped = mapMatrixRows(matrix, headerRowIndex)
          resolve({
            rows: mapped.rows,
            format: 'excel',
            headers: mapped.headers,
            warnings: headerRowIndex > 0
              ? [`Les en-têtes ont été détectés à la ligne ${headerRowIndex + 1}.`]
              : []
          })
        } catch (error) {
          reject(error)
        }
      },
      error: (error) => reject(new Error(`Lecture CSV impossible : ${error.message}`))
    })
  })
}

function tableToMatrix(table: Element): string[][] {
  return Array.from(table.querySelectorAll('tr'))
    .map((tr) =>
      Array.from(tr.querySelectorAll('th, td')).map((cell) =>
        normalizeValue(cell.textContent)
      )
    )
    .filter((row) => row.length > 0)
}

async function parseWord(file: File): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer })
  const document = new DOMParser().parseFromString(result.value, 'text/html')
  const tables = Array.from(document.querySelectorAll('table'))
  const warnings: string[] = []

  for (const table of tables) {
    const matrix = tableToMatrix(table)
    if (!matrix.length) continue

    const headerRowIndex = findHeaderRow(matrix)
    if (headerRowIndex < 0) continue

    const mapped = mapMatrixRows(matrix, headerRowIndex)
    if (!mapped.rows.length) continue

    if (headerRowIndex > 0) {
      warnings.push(
        `Les en-têtes ont été détectés à la ligne ${headerRowIndex + 1} du tableau Word.`
      )
    }

    return {
      rows: mapped.rows,
      format: 'word',
      headers: mapped.headers,
      warnings
    }
  }

  const lines = (document.body.textContent ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    throw new Error('Aucune donnée exploitable trouvée dans le document Word.')
  }

  const rows = parseTextLines(lines)
  if (!rows.length) {
    throw new Error(
      'Le document Word a été lu, mais aucune ligne avec un Nom et un Prénom n’a été détectée.'
    )
  }

  warnings.push(
    'Le document Word ne contient pas de tableau reconnu. Les lignes ont été interprétées comme une liste d’élèves.'
  )

  return { rows, format: 'word', headers: [], warnings }
}

function groupPdfTextItems(items: TextItem[]): string[] {
  const positioned = items
    .map((item) => ({
      text: String(item.str ?? '').trim(),
      x: Number(item.transform?.[4] ?? 0),
      y: Number(item.transform?.[5] ?? 0),
      width: Number(item.width ?? 0)
    }))
    .filter((item) => item.text)

  const grouped = new Map<number, typeof positioned>()

  for (const item of positioned) {
    const y = Math.round(item.y / 3) * 3
    const group = grouped.get(y) ?? []
    group.push(item)
    grouped.set(y, group)
  }

  return Array.from(grouped.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, values]) => {
      const sorted = [...values].sort((a, b) => a.x - b.x)
      const cells: string[] = []
      let current = ''
      let previousRight: number | null = null

      for (const value of sorted) {
        const gap = previousRight === null ? 0 : value.x - previousRight
        if (current && gap > 18) {
          cells.push(current.trim())
          current = ''
        }

        current = current ? `${current} ${value.text}` : value.text
        previousRight = value.x + Math.max(value.width, value.text.length * 4)
      }

      if (current.trim()) cells.push(current.trim())
      return cells.join('\t')
    })
    .filter(Boolean)
}

async function parsePDF(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const lines: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const items = content.items.filter(
      (item): item is TextItem =>
        'str' in item && typeof item.str === 'string'
    )
    lines.push(...groupPdfTextItems(items))
  }

  if (!lines.length) {
    throw new Error(
      'Aucun texte exploitable n’a été trouvé dans le PDF. Il peut s’agir d’un PDF scanné.'
    )
  }

  const rows = parseTextLines(lines)
  if (!rows.length) {
    throw new Error(
      'Le PDF a été lu, mais aucune liste d’élèves exploitable n’a été détectée. Vérifiez que le document contient Nom et Prénom.'
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
  return (
    digits.length === 8 ||
    digits.length === 10 ||
    (digits.startsWith('229') && digits.length >= 11)
  )
}

function normalizeGenderValue(value: string): string {
  const normalized = normalizeHeader(value)
  if (['f', 'feminin', 'female', 'fille'].includes(normalized)) return 'F'
  if (['m', 'masculin', 'male', 'garcon'].includes(normalized)) return 'M'
  return ''
}

function splitDelimitedLine(line: string): string[] {
  if (line.includes('\t')) return line.split(/\t+/)
  if (line.includes(';')) return line.split(';')
  if (line.includes('|')) return line.split('|')
  if (line.includes(',')) return line.split(',')
  return line.trim().split(/\s+/)
}

function cleanLeadingNumber(cells: string[]): string[] {
  const result = cells.map((value) => normalizeValue(value)).filter(Boolean)
  if (result.length && /^\d+[.)-]?$/.test(result[0])) result.shift()
  return result
}

function looksLikeTextHeader(line: string): boolean {
  const normalized = normalizeHeader(line)
  return (
    (normalized.includes('nom') && normalized.includes('prenom')) ||
    normalized === 'listeeleves' ||
    normalized === 'listedeclasse' ||
    normalized === 'eleves'
  )
}

function parseTextLines(lines: string[]): ImportedRow[] {
  const rows: ImportedRow[] = []

  for (const originalLine of lines) {
    const line = originalLine.replace(/\u00a0/g, ' ').trim()
    if (!line || looksLikeTextHeader(line)) continue

    const cells = cleanLeadingNumber(splitDelimitedLine(line))
    if (cells.length < 2) continue

    const working = [...cells]
    let sexe = ''
    let whatsapp = ''

    for (let i = 0; i < working.length; i++) {
      const gender = normalizeGenderValue(working[i])
      if (gender) {
        sexe = gender
        working.splice(i, 1)
        break
      }
    }

    for (let i = 0; i < working.length; i++) {
      if (isWhatsAppValue(working[i])) {
        whatsapp = working[i]
        working.splice(i, 1)
        break
      }
    }

    if (working.length < 2) continue

    const nom = working[0].trim()
    const prenom = working.slice(1).join(' ').trim()
    if (!nom || !prenom) continue

    rows.push({ Nom: nom, Prenom: prenom, Sexe: sexe, WhatsApp: whatsapp })
  }

  return deduplicateRows(rows)
}

function cleanRows(rows: ImportedRow[]): ImportedRow[] {
  return deduplicateRows(
    rows.filter((row) => Boolean(row.Nom?.trim() && row.Prenom?.trim()))
  )
}

function deduplicateRows(rows: ImportedRow[]): ImportedRow[] {
  const seen = new Set<string>()

  return rows.filter((row) => {
    const key = normalizeHeader(`${row.Nom ?? ''} ${row.Prenom ?? ''}`)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function parseStudentsFile(file: File): Promise<ImportResult> {
  if (!file) throw new Error('Aucun fichier sélectionné.')

  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const mime = file.type.toLowerCase()

  if (extension === 'csv' || mime.includes('csv')) {
    return parseCsv(file)
  }

  if (['xlsx', 'xls'].includes(extension) || mime.includes('spreadsheet') || mime.includes('excel')) {
    return parseExcel(file)
  }

  if (extension === 'docx' || mime.includes('wordprocessingml.document')) {
    return parseWord(file)
  }

  if (extension === 'pdf' || mime === 'application/pdf') {
    return parsePDF(file)
  }

  throw new Error(
    'Format non pris en charge. Utilisez Excel (.xlsx/.xls), CSV (.csv), Word (.docx) ou PDF (.pdf).'
  )
}