import type { Rect } from './scanCanvas'

export type GradeKind = 'fraction' | 'number' | 'none'

export interface StudentMatch {
  name: string
  score: number
}

export interface SubScore {
  label: string
  value: string
}

export interface ParsedGrade {
  value: string
  kind: GradeKind
}

/* ------------------------------------------------------------------ */
/* Types de sortie de Tesseract                                        */
/* ------------------------------------------------------------------ */

interface RawWord {
  text?: string
  confidence?: number
  bbox?: { x0: number; y0: number; x1: number; y1: number }
}

interface RawLine {
  words?: RawWord[]
}

interface RawParagraph {
  lines?: RawLine[]
}

interface RawBlock {
  paragraphs?: RawParagraph[]
}

interface RawOcrData {
  text: string
  confidence?: number
  words?: RawWord[]
  blocks?: RawBlock[] | null
}

export interface TesseractWorkerLike {
  setParameters(params: Record<string, string>): Promise<unknown>
  recognize(image: HTMLCanvasElement): Promise<{ data: RawOcrData }>
  terminate(): Promise<unknown>
}

export interface OcrWord {
  text: string
  confidence: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrOutput {
  text: string
  confidence: number
  words: OcrWord[]
}

export const DIGITS = '0123456789/,.-'
export const SCORE_CHARS = '0123456789/,.-:=;CcPp'
export const NAME_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -'"

/* ------------------------------------------------------------------ */
/* Lecture OCR                                                         */
/* ------------------------------------------------------------------ */

function collectWords(data: RawOcrData): OcrWord[] {
  const raw: RawWord[] = []

  if (data.words && data.words.length > 0) {
    for (const w of data.words) raw.push(w)
  } else if (data.blocks) {
    for (const block of data.blocks) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const word of line.words ?? []) raw.push(word)
        }
      }
    }
  }

  const out: OcrWord[] = []

  for (const w of raw) {
    if (!w.bbox || typeof w.text !== 'string') continue

    const text = w.text.trim()

    if (text === '') continue

    out.push({
      text,
      confidence: w.confidence ?? 0,
      x0: w.bbox.x0,
      y0: w.bbox.y0,
      x1: w.bbox.x1,
      y1: w.bbox.y1
    })
  }

  return out
}

export async function readImage(
  worker: TesseractWorkerLike,
  image: HTMLCanvasElement,
  psm: string,
  whitelist: string
): Promise<OcrOutput> {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    tessedit_char_whitelist: whitelist
  })

  const result = await worker.recognize(image)

  return {
    text: result.data.text,
    confidence: result.data.confidence ?? 0,
    words: collectWords(result.data)
  }
}

/* ------------------------------------------------------------------ */
/* Libellés imprimés et zones                                          */
/* ------------------------------------------------------------------ */

function normalizeLetters(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '')
}

export function findLabel(
  words: OcrWord[],
  kind: 'nom' | 'prenom' | 'note',
  pageWidth: number
): OcrWord | null {
  const matches = words.filter((w) => {
    if (w.x0 > pageWidth * 0.6) return false

    const n = normalizeLetters(w.text)

    if (kind === 'nom') return n === 'nom' || n === 'norn'
    if (kind === 'note') return n === 'note'

    return n.startsWith('pren') || n === 'prnom'
  })

  if (matches.length === 0) return null

  return [...matches].sort((a, b) => a.y0 - b.y0)[0]
}

/** Zone où l'élève écrit son nom : à droite du libellé imprimé. */
export function handwritingRect(label: OcrWord, pageWidth: number): Rect {
  const lh = Math.max(12, label.y1 - label.y0)
  const x = label.x1 + lh * 0.3

  return {
    x,
    y: Math.max(0, label.y1 - lh * 3),
    w: Math.min(pageWidth * 0.4, pageWidth - x),
    h: lh * 3.8
  }
}

/** Zone du champ « Note : ... /20 » : à droite du libellé imprimé. */
export function noteRect(label: OcrWord, pageWidth: number): Rect {
  const lh = Math.max(12, label.y1 - label.y0)

  return {
    x: label.x1,
    y: Math.max(0, label.y0 - lh * 2),
    w: pageWidth * 0.3,
    h: lh * 4.5
  }
}

/* ------------------------------------------------------------------ */
/* Lecture de la note                                                  */
/* ------------------------------------------------------------------ */

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function toFraction(numText: string, maxText: string): string | null {
  const value = parseFloat(numText.replace(',', '.'))
  const max = parseInt(maxText, 10)

  if (!Number.isFinite(value) || value < 0 || value > max) {
    return null
  }

  return `${formatNumber(value)}/${max}`
}

/**
 * Fraction empilée avec exposant décimal (14 puis petit 50 = 14,50),
 * reconnue grâce à la position des mots : dénominateur en bas, nombre
 * principal au-dessus, petit nombre en haut à droite = décimales.
 */
export function parseFromWords(words: OcrWord[]): ParsedGrade | null {
  const numeric = words
    .map((w) => ({ w, digits: w.text.replace(/[^0-9,.]/g, '') }))
    .filter((x) => /\d/.test(x.digits))

  if (numeric.length < 2) return null

  const mid = (w: OcrWord): number => (w.y0 + w.y1) / 2
  const height = (w: OcrWord): number => w.y1 - w.y0

  const denominators = numeric
    .filter((x) =>
      ['10', '20', '100'].includes(x.digits.replace(/[^0-9]/g, ''))
    )
    .sort((a, b) => mid(b.w) - mid(a.w))

  const den = denominators[0]

  if (!den) return null

  const above = numeric.filter((x) => x !== den && mid(x.w) < mid(den.w) - 1)

  if (above.length === 0) return null

  const main = [...above].sort((a, b) => height(b.w) - height(a.w))[0]
  const mainHeight = height(main.w)

  const sup = above.find(
    (x) =>
      x !== main &&
      height(x.w) < mainHeight * 0.75 &&
      x.w.x0 >= main.w.x0 &&
      mid(x.w) <= mid(main.w) + mainHeight * 0.2
  )

  let numText = main.digits

  if (sup && /^\d{1,2}$/.test(sup.digits) && /^\d{1,2}$/.test(numText)) {
    numText = `${numText}.${sup.digits}`
  }

  const fraction = toFraction(numText, den.digits.replace(/[^0-9]/g, ''))

  return fraction ? { value: fraction, kind: 'fraction' } : null
}

/**
 * Formes acceptées :
 * - 14/20, 14 / 20, 14-20, 14\20, 14 sur 20
 * - fraction empilée lue sur deux lignes : "16 20"
 * - chiffres collés : "1620"
 * - décimales : 15,5/20 ou 7.25/10
 * - nombre seul : 14 (barème supposé = defaultMax, à vérifier)
 */
export function parseGradeText(text: string, defaultMax: number): ParsedGrade {
  const t = text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

  const separated =
    /(\d{1,3}(?:[.,]\d{1,2})?)\s*[\/\\\-−–]\s*(10|20|100)(?!\d)/g

  let match = separated.exec(t)

  while (match !== null) {
    const fraction = toFraction(match[1], match[2])

    if (fraction) return { value: fraction, kind: 'fraction' }

    match = separated.exec(t)
  }

  const stacked = /(\d{1,3}(?:[.,]\d{1,2})?)\s+(10|20|100)(?!\d)/g

  match = stacked.exec(t)

  while (match !== null) {
    const fraction = toFraction(match[1], match[2])

    if (fraction) return { value: fraction, kind: 'fraction' }

    match = stacked.exec(t)
  }

  const digitsOnly = t.replace(/[^\d]/g, '')
  const glued = /^(\d{1,2})(10|20)$/.exec(digitsOnly)

  if (glued) {
    const fraction = toFraction(glued[1], glued[2])

    if (fraction) return { value: fraction, kind: 'fraction' }
  }

  const bare = /(\d{1,2}(?:[.,]\d{1,2})?)/g

  match = bare.exec(t)

  while (match !== null) {
    const value = parseFloat(match[1].replace(',', '.'))

    if (Number.isFinite(value) && value >= 0 && value <= defaultMax) {
      return { value: `${formatNumber(value)}/${defaultMax}`, kind: 'number' }
    }

    match = bare.exec(t)
  }

  return { value: '', kind: 'none' }
}

/** Sous-notes de compétences : "C1 : 4,50", "C2: 4.00", "CP=2". */
export function parseSubScore(text: string): SubScore | null {
  const t = text.replace(/\s+/g, '')
  const match = /^([Cc][Pp1-9]?)[:=;]?(\d{1,2}(?:[.,]\d{1,2})?)/.exec(t)

  if (!match) return null

  return {
    label: match[1].toUpperCase(),
    value: match[2].replace(',', '.')
  }
}

/* ------------------------------------------------------------------ */
/* Lecture du nom                                                      */
/* ------------------------------------------------------------------ */

function cleanNameLine(text: string): string {
  return text
    .replace(/[^A-Za-zÀ-ÿ'\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function keepNameTokens(text: string): string {
  return cleanNameLine(text)
    .split(' ')
    .filter((token) => token.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 2)
    .join(' ')
}

export function extractNameLines(text: string): string {
  return text
    .split('\n')
    .map(keepNameTokens)
    .filter((line) => line !== '')
    .slice(0, 3)
    .join(' ')
}

export function isReliableName(name: string, confidence: number): boolean {
  const tokens = name
    .split(' ')
    .filter((token) => token.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 3)

  return confidence >= 65 && tokens.length >= 2
}

/* ------------------------------------------------------------------ */
/* Rapprochement avec la liste des élèves                              */
/* ------------------------------------------------------------------ */

function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)

  for (let j = 0; j <= b.length; j++) {
    prev[j] = j
  }

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1

      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }

    for (let j = 0; j <= b.length; j++) {
      prev[j] = curr[j]
    }
  }

  return prev[b.length]
}

function similarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0

  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

/**
 * Classe les élèves selon leur ressemblance avec le texte lu.
 * Tableau vide si rien ne ressemble (aucun nom inventé).
 */
export function rankStudentMatches(
  raw: string,
  candidates: string[],
  limit = 3
): StudentMatch[] {
  const rawTokens = normalizeName(raw)
    .split(' ')
    .filter((token) => token.length >= 2)

  if (rawTokens.length === 0) return []

  const ranked = candidates.map((candidate): StudentMatch => {
    const tokens = normalizeName(candidate)
      .split(' ')
      .filter((token) => token.length >= 2)

    if (tokens.length === 0) return { name: candidate, score: 0 }

    let total = 0

    for (const token of tokens) {
      let best = 0

      for (const rawToken of rawTokens) {
        const score = similarity(token, rawToken)

        if (score > best) best = score
      }

      total += best
    }

    return { name: candidate, score: total / tokens.length }
  })

  return ranked
    .filter((match) => match.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Renvoie un élève seulement si la correspondance est nette. */
export function bestStudentMatch(
  raw: string,
  candidates: string[]
): StudentMatch | null {
  const ranked = rankStudentMatches(raw, candidates, 2)

  if (ranked.length === 0) return null

  const first = ranked[0]
  const second = ranked.length > 1 ? ranked[1] : null

  if (first.score < 0.7) return null
  if (second && first.score - second.score < 0.1) return null

  return first
}

// FIN scanRead.ts