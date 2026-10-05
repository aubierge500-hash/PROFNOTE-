export interface ParsedStudentLine {
  Nom: string
  Prenom: string
  Sexe?: string
  WhatsApp?: string
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeGender(value: string): string {
  const v = normalizeHeader(value)

  if (['f', 'feminin', 'female', 'fille'].includes(v)) {
    return 'F'
  }

  if (['m', 'masculin', 'male', 'garcon'].includes(v)) {
    return 'M'
  }

  return ''
}

function isWhatsApp(value: string): boolean {
  const digits = value.replace(/\D/g, '')

  return (
    digits.length === 8 ||
    digits.length === 10 ||
    (digits.startsWith('229') && digits.length >= 11)
  )
}

function splitLine(line: string): string[] {
  const trimmed = line.trim()

  if (!trimmed) return []

  if (trimmed.includes('\t')) {
    return trimmed.split(/\t+/)
  }

  if (/[;|]/.test(trimmed)) {
    return trimmed.split(/[;|]/)
  }

  if (trimmed.includes(',')) {
    return trimmed.split(',')
  }

  return trimmed.split(/\s+/)
}

function looksLikeHeader(line: string): boolean {
  const value = normalizeHeader(line)

  return (
    (value.includes('nom') && value.includes('prenom')) ||
    value === 'listeeleves' ||
    value === 'listedeclasse' ||
    value === 'eleves'
  )
}

function cleanCells(line: string): string[] {
  const cells = splitLine(line)
    .map((value) => value.trim())
    .filter(Boolean)

  if (!cells.length) return []

  // Retire N°, 1., 1), 01-, etc.
  if (/^\d+[.)-]?$/.test(cells[0])) {
    cells.shift()
  }

  return cells
}

export function parseStudentListText(
  text: string
): ParsedStudentLine[] {
  const rows: ParsedStudentLine[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine
      .replace(/\u00a0/g, ' ')
      .trim()

    if (!line || looksLikeHeader(line)) {
      continue
    }

    const cells = cleanCells(line)

    if (cells.length < 2) {
      continue
    }

    let gender = ''
    let whatsapp = ''

    const remaining: string[] = []

    for (const cell of cells) {
      const detectedGender = normalizeGender(cell)

      if (!gender && detectedGender) {
        gender = detectedGender
        continue
      }

      if (!whatsapp && isWhatsApp(cell)) {
        whatsapp = cell
        continue
      }

      remaining.push(cell)
    }

    if (remaining.length < 2) {
      continue
    }

    const lastName = remaining[0].trim()
    const firstName = remaining.slice(1).join(' ').trim()

    if (!lastName || !firstName) {
      continue
    }

    rows.push({
      Nom: lastName,
      Prenom: firstName,
      Sexe: gender || undefined,
      WhatsApp: whatsapp || undefined
    })
  }

  // Évite les doublons OCR/PDF.
  const seen = new Set<string>()

  return rows.filter((row) => {
    const key = normalizeHeader(
      `${row.Nom} ${row.Prenom}`
    )

    if (!key || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}