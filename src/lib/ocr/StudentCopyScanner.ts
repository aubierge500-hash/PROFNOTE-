import type { OCRProvider, OCRResult, DocumentType } from './types'
import {
  blankCanvas,
  cropRect,
  guessOrientations,
  loadImage,
  measureQuality,
  normalizeHeight,
  rotateImage,
  toDataUrl,
  withMargin
} from './scanCanvas'
import type { Rect, Rotation } from './scanCanvas'
import {
  buildRingImage,
  createNameImage,
  createPrintedImage,
  findRedBlobs,
  findRingInterior,
  overlapsRing,
  redInkImage
} from './scanRed'
import {
  DIGITS,
  NAME_CHARS,
  SCORE_CHARS,
  bestStudentMatch,
  extractNameLines,
  findLabel,
  handwritingRect,
  isReliableName,
  keepNameTokens,
  noteRect,
  parseFromWords,
  parseGradeText,
  parseSubScore,
  rankStudentMatches,
  readImage
} from './scanRead'
import type {
  GradeKind,
  OcrWord,
  StudentMatch,
  SubScore,
  TesseractWorkerLike
} from './scanRead'

export type { Rotation } from './scanCanvas'
export type { GradeKind, StudentMatch, SubScore } from './scanRead'
export { rankStudentMatches, bestStudentMatch } from './scanRead'

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

function scoreCandidate(c: GradeCandidate): number {
  let score = 0

  if (c.kind === 'fraction') score += 6
  else if (c.kind === 'number') score += 2

  if (c.source === 'ring') score += 3
  else if (c.source === 'field') score += 2

  return score + c.confidence / 100
}

/* ------------------------------------------------------------------ */
/* Lecture du nom                                                      */
/* ------------------------------------------------------------------ */

async function readName(
  worker: TesseractWorkerLike,
  analysis: PageAnalysis
): Promise<NameReading> {
  const { page, labels } = analysis
  const targets = [labels.nom, labels.prenom].filter(
    (label): label is OcrWord => label !== null
  )

  const parts: string[] = []
  let rawText = ''
  let confSum = 0
  let confCount = 0
  let image: HTMLCanvasElement | null = null

  if (targets.length > 0) {
    // Formulaire imprimé : on lit à droite de "Nom :" puis de "Prénom :"
    for (const label of targets) {
      const rect = handwritingRect(label, page.width)
      const crop = cropRect(page, rect.x, rect.y, rect.w, rect.h)
      const img = withMargin(normalizeHeight(createNameImage(crop), 150))
      const out = await readImage(worker, img, '7', NAME_CHARS)
      const text = keepNameTokens(out.text)

      rawText += `${out.text}\n`

      if (text !== '') {
        parts.push(text)
        confSum += out.confidence
        confCount++
      }

      if (image === null) image = img
    }
  } else {
    // Cahier : nom en haut à gauche, sur plusieurs lignes
    const crop = cropRect(
      page,
      0,
      page.height * 0.01,
      page.width * 0.4,
      page.height * 0.22
    )
    const img = withMargin(normalizeHeight(createNameImage(crop), 400))
    const out = await readImage(worker, img, '6', NAME_CHARS)
    const text = extractNameLines(out.text)

    rawText = out.text
    image = img

    if (text !== '') {
      parts.push(text)
      confSum += out.confidence
      confCount++
    }
  }

  return {
    raw: parts.join(' '),
    confidence: confCount > 0 ? confSum / confCount : 0,
    image: image ?? blankCanvas(),
    rawText
  }
}

/* ------------------------------------------------------------------ */
/* Analyse d'une orientation                                           */
/* ------------------------------------------------------------------ */

async function analyzePage(
  worker: TesseractWorkerLike,
  page: HTMLCanvasElement,
  rotation: Rotation,
  defaultMax: number
): Promise<PageAnalysis> {
  // La note est dans le haut de la page (40 %)
  const band = cropRect(page, 0, 0, page.width, page.height * 0.4)

  // 1. Libellés imprimés : Nom / Prénom / Note
  const printedOut = await readImage(
    worker,
    createPrintedImage(band),
    '11',
    ''
  )
  const labels: Labels = {
    nom: findLabel(printedOut.words, 'nom', page.width),
    prenom: findLabel(printedOut.words, 'prenom', page.width),
    note: findLabel(printedOut.words, 'note', page.width)
  }
  const noteZone = labels.note ? noteRect(labels.note, page.width) : null

  const inNote = (b: Rect): boolean => {
    if (noteZone === null) return false

    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2

    return (
      cx >= noteZone.x &&
      cx <= noteZone.x + noteZone.w &&
      cy >= noteZone.y &&
      cy <= noteZone.y + noteZone.h
    )
  }

  // 2. Note entourée
  const blobs = findRedBlobs(band).sort((a, b) => b.w * b.h - a.w * a.h)
  let ring: Rect | null = null

  for (const blob of blobs.slice(0, 3)) {
    ring = findRingInterior(band, blob, page.width)

    if (ring !== null) break
  }

  const ringBox: Rect | null = ring
  const entries: Entry[] = []
  const subScores: SubScore[] = []

  if (ringBox !== null) {
    const ringImage = withMargin(
      normalizeHeight(buildRingImage(band, ringBox), 220)
    )
    const out = await readImage(worker, ringImage, '6', DIGITS)
    const parsed =
      parseFromWords(out.words) ?? parseGradeText(out.text, defaultMax)

    if (parsed.kind !== 'none') {
      entries.push({
        candidate: {
          value: parsed.value,
          kind: parsed.kind,
          source: 'ring',
          confidence: out.confidence
        },
        image: ringImage,
        text: out.text
      })
    }
  }

  // 3. Autres taches rouges : champ "Note", sous-notes, note non entourée
  const others = blobs
    .filter((b) => ringBox === null || !overlapsRing(b, ringBox))
    .sort(
      (a, b) =>
        Number(inNote(b)) - Number(inNote(a)) || b.w * b.h - a.w * a.h
    )

  for (const blob of others.slice(0, 6)) {
    const crop = cropRect(
      band,
      blob.x - 6,
      blob.y - 6,
      blob.w + 12,
      blob.h + 12
    )
    const img = withMargin(normalizeHeight(redInkImage(crop), 160))
    const out = await readImage(worker, img, '6', SCORE_CHARS)
    const sub = parseSubScore(out.text)

    if (sub !== null) {
      subScores.push(sub)
      continue
    }

    const parsed =
      parseFromWords(out.words) ?? parseGradeText(out.text, defaultMax)

    if (parsed.kind === 'none') continue

    const source: CandidateSource = inNote(blob) ? 'field' : 'other'

    if (parsed.kind === 'number' && source === 'other' && out.confidence < 45) {
      continue
    }

    entries.push({
      candidate: {
        value: parsed.value,
        kind: parsed.kind,
        source,
        confidence: out.confidence
      },
      image: img,
      text: out.text
    })
  }

  entries.sort(
    (a, b) => scoreCandidate(b.candidate) - scoreCandidate(a.candidate)
  )

  const labelCount = [labels.nom, labels.prenom, labels.note].filter(
    (label) => label !== null
  ).length
  const best: Entry | undefined = entries[0]

  return {
    rotation,
    page,
    labels,
    candidates: entries.map((entry) => entry.candidate),
    subScores,
    gradeImage: best ? best.image : null,
    rawGradeText: best ? best.text : '',
    ringFound: ringBox !== null,
    score: (best ? scoreCandidate(best.candidate) : 0) + labelCount * 1.5
  }
}

/* ------------------------------------------------------------------ */
/* Scanner                                                             */
/* ------------------------------------------------------------------ */

export class StudentCopyScanner implements OCRProvider {
  readonly name = 'Scanner intelligent de copies'

  readonly supportedTypes: DocumentType[] = ['student_copy']

  /** Méthode compatible avec OCRProvider. */
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

  async scan(
    file: File | Blob,
    onProgress?: (progress: number) => void,
    options: ScanOptions = {}
  ): Promise<StudentCopyScanResult> {
    onProgress?.(5)

    const img = await loadImage(file)
    const base = rotateImage(img, 0)
    const quality = measureQuality(base)
    const warnings: string[] = []
    const defaultMax = options.defaultMax ?? 20

    if (quality.brightness < 70) {
      warnings.push(
        `Photo trop sombre : reprenez-la avec plus de lumière (sans flash direct sur la copie).`
      )
    }

    if (quality.contrast < 28) {
      warnings.push(
        `Photo floue ou peu contrastée : rapprochez-vous et attendez la mise au point.`
      )
    }

    onProgress?.(10)

    const mod = await import('tesseract.js')
    const lib = (mod as { default?: typeof mod }).default ?? mod
    const worker = (await lib.createWorker(
      'fra'
    )) as unknown as TesseractWorkerLike

    try {
      onProgress?.(20)

      const orientations: Rotation[] =
        options.rotation !== undefined
          ? [options.rotation]
          : guessOrientations(base)

      let best: PageAnalysis | null = null

      for (let i = 0; i < orientations.length; i++) {
        const rotation = orientations[i]
        const page = rotation === 0 ? base : rotateImage(img, rotation)
        const analysis = await analyzePage(worker, page, rotation, defaultMax)

        if (best === null || analysis.score > best.score) {
          best = analysis
        }

        onProgress?.(20 + Math.round(((i + 1) / orientations.length) * 50))

        const top: GradeCandidate | undefined = analysis.candidates[0]

        if (top !== undefined && top.kind === 'fraction') break
      }

      if (best === null) {
        throw new Error(`Aucune orientation n'a pu être analysée`)
      }

      onProgress?.(75)

      const nameRead = await readName(worker, best)

      onProgress?.(95)

      const students = options.students ?? []
      const hasList = students.length > 0
      const suggestions = hasList
        ? rankStudentMatches(nameRead.raw, students, 3)
        : []
      const matched = hasList ? bestStudentMatch(nameRead.raw, students) : null

      let name = ''

      if (matched !== null) {
        name = matched.name
      } else if (!hasList && isReliableName(nameRead.raw, nameRead.confidence)) {
        name = nameRead.raw
      }

      const chosen: GradeCandidate | undefined = best.candidates[0]
      const grade = chosen ? chosen.value : ''
      const gradeKind: GradeKind = chosen ? chosen.kind : 'none'
      const gradeConfidence = chosen ? chosen.confidence : 0

      if (!chosen) {
        warnings.push(
          `Aucune note trouvée : vérifiez qu'elle est écrite au stylo rouge en haut de la copie.`
        )
      } else if (gradeKind === 'number') {
        warnings.push(`Barème non lu sur la copie : /${defaultMax} supposé.`)
      }

      if (hasList && matched === null) {
        warnings.push(
          `Nom non reconnu avec certitude : choisissez l'élève dans la liste.`
        )
      }

      const labelsFound: string[] = []

      if (best.labels.nom) labelsFound.push('Nom')
      if (best.labels.prenom) labelsFound.push('Prénom')
      if (best.labels.note) labelsFound.push('Note')

      onProgress?.(100)

      return {
        name,
        rawName: nameRead.raw,
        matchedStudent: matched !== null ? matched.name : null,
        nameSuggestions: suggestions,
        grade,
        gradeKind,
        candidates: best.candidates,
        subScores: best.subScores,
        needsReview:
          gradeKind !== 'fraction' ||
          gradeConfidence < 55 ||
          warnings.length > 0,
        warnings,
        nameConfidence: nameRead.confidence,
        gradeConfidence,
        rotation: best.rotation,
        debug: {
          rotation: best.rotation,
          gradeImage: toDataUrl(best.gradeImage),
          nameImage: toDataUrl(nameRead.image),
          rawGradeText: best.rawGradeText,
          rawNameText: nameRead.rawText,
          labelsFound,
          ringFound: best.ringFound,
          brightness: Math.round(quality.brightness)
        }
      }
    } finally {
      await worker.terminate()
    }
  }
}

export const studentCopyScanner = new StudentCopyScanner()

// FIN StudentCopyScanner.ts