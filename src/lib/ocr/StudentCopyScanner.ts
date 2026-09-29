import type { OCRProvider, OCRResult, DocumentType } from './types'

export type Rotation = 0 | 90 | 180 | 270

export interface ScanOptions {
  /** Si absent : orientation détectée automatiquement. */
  rotation?: Rotation
}

export interface StudentCopyScanResult {
  name: string
  grade: string
  nameConfidence: number
  gradeConfidence: number
  rotation?: Rotation
}

const MAX_SIDE = 2200
const MARGIN = 24

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

/**
 * Redresse l'image selon la rotation demandée (sens horaire)
 * et la réduit si elle est très grande.
 */
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

  const canvas = document.createElement('canvas')
  canvas.width = swap ? h : w
  canvas.height = swap ? w : h

  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error(`Impossible de créer le contexte Canvas`)
  }

  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(img, -w / 2, -h / 2, w, h)

  return canvas
}

/**
 * Découpe une zone exprimée en fractions (0 à 1) de la page.
 */
function cropCanvas(
  source: HTMLCanvasElement,
  fx: number,
  fy: number,
  fw: number,
  fh: number
): HTMLCanvasElement {
  const sx = Math.round(source.width * fx)
  const sy = Math.round(source.height * fy)
  const sw = Math.max(1, Math.round(source.width * fw))
  const sh = Math.max(1, Math.round(source.height * fh))

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh

  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error(`Impossible de créer le contexte Canvas`)
  }

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)

  return canvas
}

/** Ajoute une marge blanche : Tesseract lit mieux avec de l'air autour. */
function withMargin(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.width + MARGIN * 2
  canvas.height = source.height + MARGIN * 2

  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error(`Impossible de traiter l'image`)
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, MARGIN, MARGIN)

  return canvas
}

function isRedPixel(r: number, g: number, b: number): boolean {
  return (
    r > 100 &&
    r > g * 1.25 &&
    r > b * 1.25 &&
    r - Math.max(g, b) > 30
  )
}

/**
 * Image noir sur blanc ne contenant que les pixels rouges
 * (la note du correcteur).
 */
function createRedMask(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext('2d')

  if (!ctx) {
    throw new Error(`Impossible de traiter l'image`)
  }

  const imageData = ctx.getImageData(0, 0, source.width, source.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const value = isRedPixel(data[i], data[i + 1], data[i + 2]) ? 0 : 255

    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }

  const output = document.createElement('canvas')
  output.width = source.width
  output.height = source.height

  const outputCtx = output.getContext('2d')

  if (!outputCtx) {
    throw new Error(`Impossible de traiter l'image`)
  }

  outputCtx.putImageData(imageData, 0, 0)

  return output
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

    const variance =
      weightBackground *
      weightForeground *
      (meanBackground - meanForeground) *
      (meanBackground - meanForeground)

    if (variance > maxVariance) {
      maxVariance = variance
      threshold = t
    }
  }

  return threshold
}

/**
 * Image pour lire le nom : le rouge est effacé (cercle de la note),
 * puis binarisation pour supprimer les lignes du cahier.
 */
function createNameImage(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext('2d')

  if (!ctx) {
    throw new Error(`Impossible de traiter l'image`)
  }

  const imageData = ctx.getImageData(0, 0, source.width, source.height)
  const data = imageData.data
  const gray = new Uint8Array(source.width * source.height)

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    gray[p] = isRedPixel(r, g, b)
      ? 255
      : Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }

  const threshold = otsuThreshold(gray)

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const value = gray[p] > threshold ? 255 : 0

    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }

  const output = document.createElement('canvas')
  output.width = source.width
  output.height = source.height

  const outputCtx = output.getContext('2d')

  if (!outputCtx) {
    throw new Error(`Impossible de traiter l'image`)
  }

  outputCtx.putImageData(imageData, 0, 0)

  return output
}

function cleanGradeText(text: string): string {
  return text
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Cherche une note valide dans le texte lu sur la zone rouge.
 * Renvoie '' si rien de fiable n'est trouvé.
 *
 * Formes acceptées :
 * - 14/20, 14 / 20, 14-20, 14 sur 20
 * - fraction empilée lue sur deux lignes : "16 20"
 */
function extractGrade(text: string): string {
  const normalized = cleanGradeText(text)
    .replace(/O/gi, '0')
    .replace(/I/gi, '1')
    .replace(/[|]/g, '1')

  const fractionRegex =
    /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:\/|\\|-|\bsur\b)\s*(10|20|100)\b/gi

  let match: RegExpExecArray | null = fractionRegex.exec(normalized)

  while (match !== null) {
    const value = parseFloat(match[1].replace(',', '.'))
    const max = parseInt(match[2], 10)

    if (Number.isFinite(value) && value <= max) {
      return `${match[1].replace(',', '.')}/${match[2]}`
    }

    match = fractionRegex.exec(normalized)
  }

  const stackedRegex = /(\d{1,2}(?:[.,]\d{1,2})?)\s+(10|20|100)\b/g

  match = stackedRegex.exec(normalized)

  while (match !== null) {
    const value = parseFloat(match[1].replace(',', '.'))
    const max = parseInt(match[2], 10)

    if (Number.isFinite(value) && value <= max) {
      return `${match[1].replace(',', '.')}/${match[2]}`
    }

    match = stackedRegex.exec(normalized)
  }

  return ''
}

/**
 * Garde les lignes qui ressemblent à un nom (au moins 3 lettres)
 * et retient les deux premières : nom et prénom.
 */
function cleanNameText(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/[^A-Za-zÀ-ÿ'\- ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((line) => line.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 3)
    .slice(0, 2)
    .join(' ')
}

interface GradeCandidate {
  rotation: Rotation
  page: HTMLCanvasElement
  grade: string
  confidence: number
}

export class StudentCopyScanner implements OCRProvider {
  readonly name = 'Scanner intelligent de copies'

  readonly supportedTypes: DocumentType[] = ['student_copy']

  /**
   * Méthode compatible avec OCRProvider.
   */
  async recognize(
    file: File | Blob,
    onProgress?: (progress: number) => void
  ): Promise<OCRResult> {
    const result = await this.scan(file, onProgress)

    return {
      text: [
        `NOM_DETECTE: ${result.name}`,
        `NOTE_DETECTEE: ${result.grade}`
      ].join('\n'),

      confidence:
        (result.nameConfidence + result.gradeConfidence) / 2
    }
  }

  /**
   * Analyse spécialisée d'une copie d'élève.
   *
   * 1. Essaie les orientations jusqu'à trouver une note valide
   *    (zone du haut, pixels rouges uniquement).
   * 2. Lit le nom dans la marge gauche, sous la note.
   */
  async scan(
    file: File | Blob,
    onProgress?: (progress: number) => void,
    options: ScanOptions = {}
  ): Promise<StudentCopyScanResult> {
    onProgress?.(5)

    const img = await loadImage(file)

    onProgress?.(12)

    const Tesseract = await import('tesseract.js')
    const worker = await Tesseract.createWorker('fra')

    try {
      onProgress?.(25)

      const orientations: Rotation[] =
        options.rotation !== undefined
          ? [options.rotation]
          : [0, 90, 270, 180]

      let best: GradeCandidate | null = null

      for (let i = 0; i < orientations.length; i++) {
        const rotation = orientations[i]
        const page = rotateImage(img, rotation)

        // Zone de la note : 30 % supérieurs de la page
        const gradeZone = cropCanvas(page, 0, 0, 1, 0.3)
        const mask = withMargin(createRedMask(gradeZone))

        const gradeResult = await worker.recognize(mask)
        const grade = extractGrade(gradeResult.data.text)
        const confidence = gradeResult.data.confidence ?? 0

        const candidate: GradeCandidate = {
          rotation,
          page,
          grade,
          confidence
        }

        if (
          best === null ||
          (grade !== '' && best.grade === '') ||
          (grade === '' && best.grade === '' && confidence > best.confidence)
        ) {
          best = candidate
        }

        onProgress?.(25 + Math.round(((i + 1) / orientations.length) * 45))

        if (grade !== '') {
          break
        }
      }

      if (best === null) {
        throw new Error(`Aucune orientation n'a pu être analysée`)
      }

      onProgress?.(72)

      // Zone du nom : marge gauche, juste sous le bord haut de la page
      const nameZone = cropCanvas(best.page, 0, 0.06, 0.42, 0.24)
      const nameImage = withMargin(createNameImage(nameZone))

      const nameResult = await worker.recognize(nameImage)
      const name = cleanNameText(nameResult.data.text)

      onProgress?.(100)

      return {
        name,
        grade: best.grade,
        nameConfidence: nameResult.data.confidence ?? 0,
        gradeConfidence: best.grade !== '' ? best.confidence : 0,
        rotation: best.rotation
      }
    } finally {
      await worker.terminate()
    }
  }
}

export const studentCopyScanner = new StudentCopyScanner()