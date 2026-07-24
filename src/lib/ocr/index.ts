import type { DocumentType, OCRProvider } from './types'
import { TesseractProvider } from './TesseractProvider'

export type { DocumentType, OCRProvider, OCRResult } from './types'

const tesseractProvider = new TesseractProvider()

/**
 * Retourne le moteur OCR adapté au type de document.
 * Pour ajouter un nouveau moteur plus tard (Google Vision, Azure...) :
 * créer une classe qui implémente OCRProvider dans ce dossier,
 * puis l'enregistrer ici. Aucun autre fichier du projet à modifier.
 */
export function getOcrProvider(documentType: DocumentType): OCRProvider {
  switch (documentType) {
    case 'printed':
      return tesseractProvider
    case 'handwritten':
    case 'student_copy':
      // PaddleProvider arrive à l'étape suivante — fallback temporaire sur Tesseract
      return tesseractProvider
    default:
      return tesseractProvider
  }
}
