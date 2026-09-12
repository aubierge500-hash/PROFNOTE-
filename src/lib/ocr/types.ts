export type DocumentType = 'printed' | 'handwritten' | 'student_copy'

export interface OCRResult {
  text: string
  confidence: number
}

export interface OCRProvider {
  readonly name: string
  readonly supportedTypes: DocumentType[]
  recognize(file: File | Blob, onProgress?: (progress: number) => void): Promise<OCRResult>
}
