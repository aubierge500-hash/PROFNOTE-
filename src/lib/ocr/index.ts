import type { DocumentType, OCRProvider } from './types'

import { TesseractProvider } from './TesseractProvider'
import { PaddleProvider } from './PaddleProvider'
import { StudentCopyScanner } from './StudentCopyScanner'

export type {
  DocumentType,
  OCRProvider,
  OCRResult
} from './types'

const tesseractProvider = new TesseractProvider()
const paddleProvider = new PaddleProvider()
const studentCopyScanner = new StudentCopyScanner()

/**
 * Retourne le moteur OCR adapté au type de document.
 */
export function getOcrProvider(
  documentType: DocumentType
): OCRProvider {
  switch (documentType) {
    case 'printed':
      return tesseractProvider

    case 'handwritten':
      return paddleProvider

    case 'student_copy':
      return studentCopyScanner

    default:
      return tesseractProvider
  }
}

export { studentCopyScanner }