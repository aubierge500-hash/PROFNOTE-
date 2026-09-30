import { blankCanvas, cropRect, makeCanvas, otsuThreshold } from './scanCanvas'
import type { Rect } from './scanCanvas'

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
export function redInkImage(
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
export function findRedBlobs(zone: HTMLCanvasElement): Rect[] {
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
export function findRingInterior(
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
export function buildRingImage(
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

export function overlapsRing(b: Rect, r: Rect): boolean {
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

function grayscaleWithoutRed(source: HTMLCanvasElement): Uint8Array {
  const ctx = source.getContext('2d')

  if (!ctx) {
    throw new Error(`Impossible de traiter l'image`)
  }

  const data = ctx.getImageData(0, 0, source.width, source.height).data
  const gray = new Uint8Array(source.width * source.height)

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    gray[p] = isRedPixel(r, g, b)
      ? 255
      : Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }

  return gray
}

function grayToCanvas(
  gray: Uint8Array,
  width: number,
  height: number,
  binarize: boolean
): HTMLCanvasElement {
  const threshold = binarize ? otsuThreshold(gray) : 0
  const { canvas, ctx } = makeCanvas(width, height)
  const image = ctx.createImageData(width, height)

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const value = binarize ? (gray[p] > threshold ? 255 : 0) : gray[p]

    image.data[i] = value
    image.data[i + 1] = value
    image.data[i + 2] = value
    image.data[i + 3] = 255
  }

  ctx.putImageData(image, 0, 0)

  return canvas
}

/** Texte imprimé (libellés Nom / Prénom / Note) : rouge effacé, niveaux de gris. */
export function createPrintedImage(
  source: HTMLCanvasElement
): HTMLCanvasElement {
  return grayToCanvas(
    grayscaleWithoutRed(source),
    source.width,
    source.height,
    false
  )
}

/** Écriture du nom : rouge effacé puis binarisation (supprime les lignes). */
export function createNameImage(source: HTMLCanvasElement): HTMLCanvasElement {
  return grayToCanvas(
    grayscaleWithoutRed(source),
    source.width,
    source.height,
    true
  )
}

// FIN scanRed.ts