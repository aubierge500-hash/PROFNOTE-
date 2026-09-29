import type { OCRProvider, OCRResult, DocumentType } from './types'

export interface StudentCopyScanResult {
  name: string
  grade: string
  nameConfidence: number
  gradeConfidence: number
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

function imageToCanvas(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')

  canvas.width = Math.max(1, Math.round(sw))
  canvas.height = Math.max(1, Math.round(sh))

  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error(`Impossible de créer le contexte Canvas`)
  }

  ctx.drawImage(
    img,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height
  )

  return canvas
}

/**
 * Crée une image contenant principalement les pixels rouges.
 *
 * La note finale étant écrite en rouge, cette étape permet
 * d'éliminer une grande partie du contenu manuscrit noir/bleu.
 */
function createRedMask(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')

  canvas.width = source.width
  canvas.height = source.height

  const sourceCtx = source.getContext('2d')
  const targetCtx = canvas.getContext('2d')

  if (!sourceCtx || !targetCtx) {
    throw new Error(`Impossible de traiter l'image`)
  }

  const imageData = sourceCtx.getImageData(
    0,
    0,
    source.width,
    source.height
  )

  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    /*
     * Détection volontairement assez tolérante du rouge.
     *
     * On demande :
     * - rouge supérieur au vert
     * - rouge supérieur au bleu
     * - différence suffisamment importante
     */
    const isRed =
      r > 100 &&
      r > g * 1.25 &&
      r > b * 1.25 &&
      r - Math.max(g, b) > 30

    if (isRed) {
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = 255
    } else {
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = 255
    }
  }

  targetCtx.putImageData(imageData, 0, 0)

  return canvas
}

function cleanGradeText(text: string): string {
  return text
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractGrade(text: string): string {
  const normalized = cleanGradeText(text)
    .replace(/O/gi, '0')
    .replace(/I/gi, '1')
    .replace(/[|]/g, '1')

  /*
   * Priorité aux formes :
   * 14/20
   * 14 / 20
   * 14-20
   * 14 sur 20
   */
  const fractionMatch = normalized.match(
    /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:\/|-|\bsur\b)\s*(10|20|100)\b/i
  )

  if (fractionMatch) {
    return `${fractionMatch[1].replace(',', '.')}/${fractionMatch[2]}`
  }

  /*
   * Si le professeur écrit seulement :
   * 14
   * 16,5
   */
  const numberMatch = normalized.match(
    /\b(\d{1,2}(?:[.,]\d{1,2})?)\b/
  )

  if (numberMatch) {
    return numberMatch[1].replace(',', '.')
  }

  return ''
}

function cleanNameText(text: string): string {
  return text
    .replace(/[|_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export class StudentCopyScanner implements OCRProvider {
  readonly name = 'Scanner intelligent de copies'

  readonly supportedTypes: DocumentType[] = ['student_copy']

  /**
   * Méthode compatible avec OCRProvider.
   *
   * Elle retourne un OCRResult classique afin de rester compatible
   * avec l'architecture actuelle de PROFNOTE.
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
   */
  async scan(
    file: File | Blob,
    onProgress?: (progress: number) => void
  ): Promise<StudentCopyScanResult> {
    onProgress?.(5)

    const img = await loadImage(file)

    onProgress?.(20)

    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height

    /*
     * ZONE NOTE
     *
     * La note est complètement en haut de la page.
     * On prend les 25 % supérieurs.
     */
    const gradeCanvas = imageToCanvas(
      img,
      0,
      0,
      width,
      height * 0.25
    )

    onProgress?.(35)

    const redMask = createRedMask(gradeCanvas)

    onProgress?.(50)

    const Tesseract = await import('tesseract.js')

    const gradeResult = await Tesseract.recognize(
      redMask,
      'fra',
      {
        logger: (message) => {
          if (
            message.status === 'recognizing text' &&
            message.progress
          ) {
            onProgress?.(
              50 + Math.round(message.progress * 20)
            )
          }
        }
      }
    )

    const gradeText = cleanGradeText(gradeResult.data.text)
    const grade = extractGrade(gradeText)

    onProgress?.(72)

    /*
     * ZONE NOM
     *
     * Le nom se trouve dans la marge gauche,
     * légèrement sous la zone de la note.
     *
     * x = 0 → 38 % de la largeur
     * y = 10 → 45 % de la hauteur
     */
    const nameCanvas = imageToCanvas(
      img,
      0,
      height * 0.10,
      width * 0.38,
      height * 0.35
    )

    onProgress?.(78)

    const nameResult = await Tesseract.recognize(
      nameCanvas,
      'fra',
      {
        logger: (message) => {
          if (
            message.status === 'recognizing text' &&
            message.progress
          ) {
            onProgress?.(
              78 + Math.round(message.progress * 18)
            )
          }
        }
      }
    )

    const name = cleanNameText(nameResult.data.text)

    onProgress?.(100)

    return {
      name,
      grade,
      nameConfidence: nameResult.data.confidence ?? 0,
      gradeConfidence: gradeResult.data.confidence ?? 0
    }
  }
}

export const studentCopyScanner = new StudentCopyScanner()