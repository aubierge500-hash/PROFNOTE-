import type { OCRProvider, OCRResult, DocumentType } from './types'

let paddleOcrModule: typeof import('@paddlejs-models/ocr') | null = null
let modelInitialized = false

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

export class PaddleProvider implements OCRProvider {
  readonly name = 'PaddleOCR (manuscrit)'
  readonly supportedTypes: DocumentType[] = ['handwritten', 'student_copy']

  async recognize(file: File | Blob, onProgress?: (progress: number) => void): Promise<OCRResult> {
    if (!paddleOcrModule) {
      onProgress?.(5)
      paddleOcrModule = await import('@paddlejs-models/ocr')
    }
    if (!modelInitialized) {
      onProgress?.(20)
      await paddleOcrModule.init()
      modelInitialized = true
    }

    onProgress?.(60)
    const img = await loadImage(file)
    const res = await paddleOcrModule.recognize(img)
    onProgress?.(100)

    const text = Array.isArray(res.text) ? res.text.join('\n') : String(res.text ?? '')

    return {
      text,
      // PaddleOCR JS ne fournit pas de score de confiance global fiable :
      // on renvoie 0 volontairement pour forcer une vérification manuelle systématique
      confidence: 0
    }
  }
}
