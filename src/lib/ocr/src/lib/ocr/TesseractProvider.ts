import type { OCRProvider, OCRResult, DocumentType } from './types'

export class TesseractProvider implements OCRProvider {
  readonly name = 'Tesseract (imprimé)'
  readonly supportedTypes: DocumentType[] = ['printed']

  async recognize(file: File | Blob, onProgress?: (progress: number) => void): Promise<OCRResult> {
    const Tesseract = await import('tesseract.js')
    const result = await Tesseract.recognize(file, 'fra', {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(m.progress * 100))
        }
      }
    })
    return {
      text: result.data.text,
      confidence: result.data.confidence ?? 0
    }
  }
}
