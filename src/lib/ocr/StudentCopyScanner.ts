import type { OCRProvider, OCRResult, DocumentType } from './types'

export type Rotation = 0 | 90 | 180 | 270
export type GradeKind = 'fraction' | 'number' | 'none'
export type CandidateSource = 'ring' | 'field' | 'other'

export interface ScanOptions {
  /** Si absent : le sens de la photo est détecté automatiquement. */
  rotation?: Rotation
  /** Élèves de la classe ("NOM Prénom") : indispensable pour fiabiliser le nom. */
  students?: string[]
  /** Barème supposé quand seule la note est écrite (défaut : 20). */
  defaultMax?: number
}

export interface GradeCandidate {
  value: string
  kind: GradeKind
  source: CandidateSource
  confidence: number
}

export interface SubScore {
  label: string
  value: string
}

export interface StudentMatch {
  name: string
  score: number
}

export interface ScanDebug {
  rotation: Rotation
  gradeImage: string
  nameImage: string
  rawGradeText: string
  rawNameText: string
  labelsFound: string[]
  ringFound: boolean
  brightness: number
}

export interface StudentCopyScanResult {
  /** Nom fiable (élève reconnu dans la liste), sinon chaîne vide. */
  name: string
  /** Texte brut lu : à ne jamais afficher comme un nom. */
  rawName: string
  matchedStudent: string | null
  nameSuggestions: StudentMatch[]
  grade: string
  gradeKind: GradeKind
  /** Toutes les notes trouvées, la meilleure en premier. */
  candidates: GradeCandidate[]
  /** Sous-notes de compétences (C1, C2, CP...). */
  subScores: SubScore[]
  needsReview: boolean
  warnings: string[]
  nameConfidence: number
  gradeConfidence: number
  rotation: Rotation
  debug: ScanDebug
}

/* ------------------------------------------------------------------ */
/* Types internes                                                      */
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

interface TesseractWorkerLike {
  setParameters(params: Record<string, string>): Promise<unknown>
  recognize(image: HTMLCanvasElement): Promise<{ data: RawOcrData }>
  terminate(): Promise<unknown>
}

interface OcrWord {
  text: string
  confidence: number
  x0: number
  y0: number
  x1: number
  y1: number
}

interface OcrOutput {
  text: string
  confidence: number
  words: OcrWord[]
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface ParsedGrade {
  value: string
  kind: GradeKind
}

interface Labels {
  nom: OcrWord | null
  prenom: OcrWord | null
  note: OcrWord | null
}

interface Entry {
  candidate: GradeCandidate
  image: HTMLCanvasElement
  text: string
}

interface PageAnalysis {
  rotation: Rotation
  page: HTMLCanvasElement
  labels: Labels
  candidates: GradeCandidate[]
  subScores: SubScore[]
  gradeImage: HTMLCanvasElement | null
  rawGradeText: string
  ringFound: boolean
  score: number
}

interface NameReading {
  raw: string
  confidence: number
  image: HTMLCanvasElement
  rawText: string
}

const MAX_SIDE = 2200
const MARGIN = 24
const DIGITS = '0123456789/,.-'
const SCORE_CHARS = '0123456789/,.-:=;CcPp'
const NAME_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -'"

/* ------------------------------------------------------------------ */
/* Utilitaires canvas                                                  */
/* ------------------------------------------------------------------ */

function makeCanvas(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')

  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))

  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  if (!ctx) {
    throw new Error(`Impossible de créer le contexte Canvas`)
  }

  return { canvas, ctx }
}

function blankCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(40, 40)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 40, 40)

  return canvas
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }

    img.onerror = (error) => {
      URL.revokeObjectURL(url)
      reject(error)
    }

    img.src = url
  })
}

/** Redresse l'image (sens horaire) et la réduit si elle est très grande. */
function rotateImage(
  img: HTMLImageElement,
  rotation: Rotation
): HTMLCanvasElement {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH))
  const w = Math.round(srcW * scale)
  const h = Math.round(srcH * scale)
  const swap = rotation === 90 || rotation === 270

  const { canvas, ctx } = makeCanvas(swap ? h : w, swap ? w : h)

  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(img, -w / 2, -h / 2, w, h)

  return canvas
}

function cropRect(
  source: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number
): HTMLCanvasElement {
  const sx = Math.max(0, Math.round(x))
  const sy = Math.max(0, Math.round(y))
  const sw = Math.max(1, Math.min(source.width - sx, Math.round(w)))
  const sh = Math.max(1, Math.min(source.height - sy, Math.round(h)))

  const { canvas, ctx } = makeCanvas(sw, sh)

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)

  return canvas
}

/** Marge blanche autour de l'image : Tesseract lit mieux avec de l'air. */
function withMargin(source: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(
    source.width + MARGIN * 2,
    source.height + MARGIN * 2
  )

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, MARGIN, MARGIN)

  return canvas
}

/** Ramène l'image à une hauteur adaptée à la lecture. */
function normalizeHeight(
  source: HTMLCanvasElement,
  target: number
): HTMLCanvasElement {
  const scale = Math.min(3, Math.max(0.35, target / source.height))
  const { canvas, ctx } = makeCanvas(
    source.width * scale,
    source.height * scale
  )

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)

  return canvas
}

function toDataUrl(canvas: HTMLCanvasElement | null): string {
  if (canvas === null) return ''

  try {
    return canvas.toDataURL('image/jpeg', 0.7)
  } catch {
    return ''
  }
}

/* ------------------------------------------------------------------ */
/* Qualité de la photo et sens de la page                              */
/* ------------------------------------------------------------------ */

function measureQuality(source: HTMLCanvasElement): {
  brightness: number
  contrast: number
} {
  const scale = Math.min(1, 160 / Math.max(source.width, source.height))
  const w = Math.max(1, Math.round(source.width * scale))
  const h = Math.max(1, Math.round(source.height * scale))
  const { ctx } = makeCanvas(w, h)

  ctx.drawImage(source, 0, 0, w, h)

  const data = ctx.getImageData(0, 0, w, h).data
  const n = w * h
  let sum = 0
  let sumSq = 0

  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]

    sum += luma
    sumSq += luma * luma
  }

  const mean = sum / n

  return {
    brightness: mean,
    contrast: Math.sqrt(Math.max(0, sumSq / n - mean * mean))
  }
}

function otsuThreshold(gray: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0)

  for (let i = 0; i < gray.length; i++) {
    histogram[gray[i]]++
  }

  const total = gray.length
  let sum = 0

  for (let t = 0; t < 256; t++) {
    sum += t * histogram[t]
  }

  let sumBackground = 0
  let weightBackground = 0
  let maxVariance = 0
  let threshold = 128

  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t]

    if (weightBackground === 0) continue

    const weightForeground = total - weightBackground

    if (weightForeground === 0) break

    sumBackground += t * histogram[t]

    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sum - sumBackground) / weightForeground
    const diff = meanBackground - meanForeground
    const between = weightBackground * weightForeground * diff * diff

    if (between > maxVariance) {
      maxVariance = between
      threshold = t
    }
  }

  return threshold
}

function variance(values: number[]): number {
  const n = values.length

  if (n === 0) return 0

  let mean = 0

  for (const v of values) mean += v

  mean /= n

  let acc = 0

  for (const v of values) acc += (v - mean) * (v - mean)

  return acc / n
}

/**
 * Devine si les lignes de texte sont horizontales (page droite ou à
 * l'envers) ou verticales (page couchée), et renvoie l'ordre d'essai.
 */
function guessOrientations(source: HTMLCanvasElement): Rotation[] {
  const scale = Math.min(1, 300 / Math.max(source.width, source.height))
  const w = Math.max(1, Math.round(source.width * scale))
  const h = Math.max(1, Math.round(source.height * scale))
  const { ctx } = makeCanvas(w, h)

  ctx.drawImage(source, 0, 0, w, h)

  const data = ctx.getImageData(0, 0, w, h).data
  const gray = new Uint8Array(w * h)

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    gray[p] = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    )
  }

  const threshold = otsuThreshold(gray)
  const rows = new Array<number>(h).fill(0)
  const cols = new Array<number>(w).fill(0)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] <= threshold) {
        rows[y]++
        cols[x]++
      }
    }
  }

  const rowVar = variance(rows.map((v) => v / w))
  const colVar = variance(cols.map((v) => v / h))

  return rowVar >= colVar ? [0, 180, 90, 270] : [90, 270, 0, 180]
}

/* ------------------------------------------------------------------ */
/* Détection du rouge, taches et cercles                               */
/* ------------------------------------------------------------------ */

function isRedPixel(r: number, g: number, b: number): boolean {
  return (
    r > 100 &&
    r > g * 1.25 &&
    r > b * 1.25 &&
    r - Math.max(g, b) > 30
  )
}

/**
 * Image noir sur blanc des seuls pixels rouges, rognée au plus juste.
 * `keep` permet d'exclure des zones (par exemple le trait du cercle).
 */
function redInkImage(
  source: HTMLCanvasElement,
  keep?: (x: number, y: number) => boolean
): HTMLCanvasElement {
  const ctx = source.getContext('2d')

  if (!ctx) {
    throw new Error(`Impossible de traiter l'image`)
  }

  const w = source.width
  const h = source.height
  const data = ctx.getImageData(0, 0, w, h).data
  const ink = new Uint8Array(w * h)
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4

      if (!isRedPixel(data[i], data[i + 1], data[i + 2])) continue
      if (keep && !keep(x, y)) continue

      ink[y * w + x] = 1

      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0) {
    return blankCanvas()
  }

  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const { canvas, ctx: outCtx } = makeCanvas(bw, bh)
  const out = outCtx.createImageData(bw, bh)

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const value = ink[(minY + y) * w + (minX + x)] === 1 ? 0 : 255
      const o = (y * bw + x) * 4

      out.data[o] = value
      out.data[o + 1] = value
      out.data[o + 2] = value
      out.data[o + 3] = 255
    }
  }

  outCtx.putImageData(out, 0, 0)

  return canvas
}

function dilate(
  src: Uint8Array,
  w: number,
  h: number,
  r: number
): Uint8Array {
  const tmp = new Uint8Array(src.length)

  for (let y = 0; y < h; y++) {
    const row = y * w

    for (let x = 0; x < w; x++) {
      if (src[row + x] === 0) continue

      const from = Math.max(0, x - r)
      const to = Math.min(w - 1, x + r)

      for (let xx = from; xx <= to; xx++) {
        tmp[row + xx] = 1
      }
    }
  }

  const out = new Uint8Array(src.length)

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x] === 0) continue

      const from = Math.max(0, y - r)
      const to = Math.min(h - 1, y + r)

      for (let yy = from; yy <= to; yy++) {
        out[yy * w + x] = 1
      }
    }
  }

  return out
}

function labelBlobs(
  mask: Uint8Array,
  cw: number,
  ch: number,
  k: number,
  width: number,
  height: number
): Rect[] {
  const visited = new Uint8Array(mask.length)
  const stack = new Int32Array(mask.length)
  const blobs: Rect[] = []

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || visited[start] === 1) continue

    let sp = 0

    stack[sp++] = start
    visited[start] = 1

    let minX = cw
    let minY = ch
    let maxX = 0
    let maxY = 0
    let count = 0

    while (sp > 0) {
      const cur = stack[--sp]
      const cx = cur % cw
      const cy = (cur - cx) / cw

      count++

      if (cx < minX) minX = cx
      if (cx > maxX) maxX = cx
      if (cy < minY) minY = cy
      if (cy > maxY) maxY = cy

      if (cx > 0 && mask[cur - 1] === 1 && visited[cur - 1] === 0) {
        visited[cur - 1] = 1
        stack[sp++] = cur - 1
      }

      if (cx < cw - 1 && mask[cur + 1] === 1 && visited[cur + 1] === 0) {
        visited[cur + 1] = 1
        stack[sp++] = cur + 1
      }

      if (cy > 0 && mask[cur - cw] === 1 && visited[cur - cw] === 0) {
        visited[cur - cw] = 1
        stack[sp++] = cur - cw
      }

      if (
        cy < ch - 1 &&
        mask[cur + cw] === 1 &&
        visited[cur + cw] === 0
      ) {
        visited[cur + cw] = 1
        stack[sp++] = cur + cw
      }
    }

    if (count < 8) continue

    const x = minX * k
    const y = minY * k
    const w = Math.min(width - x, (maxX - minX + 1) * k)
    const h = Math.min(height - y, (maxY - minY + 1) * k)
    const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h))

    // On écarte les traits fins (soulignements, barres de marge)
    if (aspect > 6) continue
    if (w > width * 0.9) continue

    blobs.push({ x, y, w, h })
  }

  return blobs
}

/** Taches rouges d'une zone : cercle de la note, chiffres, sous-notes... */
function findRedBlobs(zone: HTMLCanvasElement): Rect[] {
  const ctx = zone.getContext('2d')

  if (!ctx) {
    throw new Error(`Impossible de traiter l'image`)
  }

  const { width, height } = zone
  const data = ctx.getImageData(0, 0, width, height).data
  const k = Math.max(1, Math.ceil(Math.max(width, height) / 700))
  const cw = Math.ceil(width / k)
  const ch = Math.ceil(height / k)
  const counts = new Uint16Array(cw * ch)

  for (let y = 0; y < height; y++) {
    const rowCell = Math.floor(y / k) * cw

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4

      if (isRedPixel(data[i], data[i + 1], data[i + 2])) {
        counts[rowCell + Math.floor(x / k)]++
      }
    }
  }

  const minCount = k >= 3 ? 2 : 1
  const cells = new Uint8Array(cw * ch)

  for (let c = 0; c < cells.length; c++) {
    cells[c] = counts[c] >= minCount ? 1 : 0
  }

  return labelBlobs(dilate(cells, cw, ch, 2), cw, ch, k, width, height)
}

/**
 * Cherche une note ENTOURÉE dans une tache rouge : un cercle est un
 * contour fermé qui enferme une grande zone vide. Cette méthode marche
 * même quand le cercle touche d'autres traits (ancienne note barrée,
 * barre de fraction qui dépasse...).
 * Renvoie l'intérieur du cercle, ou null.
 */
function findRingInterior(
  band: HTMLCanvasElement,
  blob: Rect,
  pageWidth: number
): Rect | null {
  const pad = 4
  const ox = Math.max(0, Math.round(blob.x - pad))
  const oy = Math.max(0, Math.round(blob.y - pad))
  const crop = cropRect(band, ox, oy, blob.w + pad * 2, blob.h + pad * 2)
  const scale = Math.min(1, 360 / Math.max(crop.width, crop.height))
  const sw = Math.max(1, Math.round(crop.width * scale))
  const sh = Math.max(1, Math.round(crop.height * scale))
  const { ctx } = makeCanvas(sw, sh)

  ctx.drawImage(crop, 0, 0, sw, sh)

  const data = ctx.getImageData(0, 0, sw, sh).data
  const mask = new Uint8Array(sw * sh)

  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    mask[p] = isRedPixel(data[i], data[i + 1], data[i + 2]) ? 1 : 0
  }

  // On épaissit le trait pour refermer les petites coupures du stylo
  const closed = dilate(mask, sw, sh, 2)
  const outside = new Uint8Array(sw * sh)
  const stack = new Int32Array(sw * sh)
  let sp = 0

  const seed = (idx: number): void => {
    if (closed[idx] === 0 && outside[idx] === 0) {
      outside[idx] = 1
      stack[sp++] = idx
    }
  }

  for (let x = 0; x < sw; x++) {
    seed(x)
    seed((sh - 1) * sw + x)
  }

  for (let y = 0; y < sh; y++) {
    seed(y * sw)
    seed(y * sw + sw - 1)
  }

  while (sp > 0) {
    const cur = stack[--sp]
    const cx = cur % sw
    const cy = (cur - cx) / sw

    if (cx > 0) seed(cur - 1)
    if (cx < sw - 1) seed(cur + 1)
    if (cy > 0) seed(cur - sw)
    if (cy < sh - 1) seed(cur + sw)
  }

  // Zones vides enfermées : on ne garde que les grandes (pas les "0", "6"...)
  const seen = new Uint8Array(sw * sh)
  const minSide = pageWidth * scale * 0.05
  const minArea = minSide * minSide * 0.35
  let uMinX = sw
  let uMinY = sh
  let uMaxX = -1
  let uMaxY = -1

  const visit = (idx: number): void => {
    if (closed[idx] === 0 && outside[idx] === 0 && seen[idx] === 0) {
      seen[idx] = 1
      stack[sp++] = idx
    }
  }

  for (let start = 0; start < seen.length; start++) {
    if (closed[start] === 1 || outside[start] === 1 || seen[start] === 1) {
      continue
    }

    let area = 0
    let minX = sw
    let minY = sh
    let maxX = -1
    let maxY = -1

    sp = 0
    visit(start)

    while (sp > 0) {
      const cur = stack[--sp]
      const cx = cur % sw
      const cy = (cur - cx) / sw

      area++

      if (cx < minX) minX = cx
      if (cx > maxX) maxX = cx
      if (cy < minY) minY = cy
      if (cy > maxY) maxY = cy

      if (cx > 0) visit(cur - 1)
      if (cx < sw - 1) visit(cur + 1)
      if (cy > 0) visit(cur - sw)
      if (cy < sh - 1) visit(cur + sw)
    }

    if (area >= minArea) {
      if (minX < uMinX) uMinX = minX
      if (minY < uMinY) uMinY = minY
      if (maxX > uMaxX) uMaxX = maxX
      if (maxY > uMaxY) uMaxY = maxY
    }
  }

  if (uMaxX < 0) return null

  const inv = 1 / scale

  return {
    x: ox + uMinX * inv,
    y: oy + uMinY * inv,
    w: (uMaxX - uMinX + 1) * inv,
    h: (uMaxY - uMinY + 1) * inv
  }
}

/** Image de l'intérieur du cercle : le trait du cercle est effacé. */
function buildRingImage(
  band: HTMLCanvasElement,
  ring: Rect
): HTMLCanvasElement {
  const padX = ring.w * 0.06
  const padY = ring.h * 0.06
  const sx = Math.max(0, Math.round(ring.x - padX))
  const sy = Math.max(0, Math.round(ring.y - padY))
  const crop = cropRect(band, sx, sy, ring.w + padX * 2, ring.h + padY * 2)
  const cx = ring.x + ring.w / 2 - sx
  const cy = ring.y + ring.h / 2 - sy
  const rx = ring.w / 2 + padX * 0.5
  const ry = ring.h / 2 + padY * 0.5

  return redInkImage(crop, (x, y) => {
    const dx = (x - cx) / rx
    const dy = (y - cy) / ry

    return dx * dx + dy * dy <= 1
  })
}

function overlapsRing(b: Rect, r: Rect): boolean {
  const bx = b.x + b.w / 2
  const by = b.y + b.h / 2
  const inside =
    bx >= r.x - r.w * 0.1 &&
    bx <= r.x + r.w * 1.1 &&
    by >= r.y - r.h * 0.1 &&
    by <= r.y + r.h * 1.1
  const rcx = r.x + r.w / 2
  const rcy = r.y + r.h / 2
  const contains =
    rcx >= b.x && rcx <= b.x + b.w && rcy >= b.y && rcy <= b.y + b.h

  return inside || contains
}

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

async function readImage(
  worker: TesseractWorkerLike,
  image: HTMLCanvasElement,
  psm: string,
  whitelist: string
): Promise