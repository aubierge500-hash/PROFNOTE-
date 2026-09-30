export type Rotation = 0 | 90 | 180 | 270

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const MAX_SIDE = 2200
const MARGIN = 24

export function makeCanvas(
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

export function blankCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(40, 40)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 40, 40)

  return canvas
}

export function loadImage(file: File | Blob): Promise<HTMLImageElement> {
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
export function rotateImage(
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

export function cropRect(
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
export function withMargin(source: HTMLCanvasElement): HTMLCanvasElement {
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
export function normalizeHeight(
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

export function toDataUrl(canvas: HTMLCanvasElement | null): string {
  if (canvas === null) return ''

  try {
    return canvas.toDataURL('image/jpeg', 0.7)
  } catch {
    return ''
  }
}

/** Luminosité et contraste de la photo (pour avertir si elle est trop sombre). */
export function measureQuality(source: HTMLCanvasElement): {
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

export function otsuThreshold(gray: Uint8Array): number {
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
export function guessOrientations(source: HTMLCanvasElement): Rotation[] {
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

// FIN scanCanvas.ts