export type GradeValidationResult =
  | {
      valid: true
      score: number | null
      maxScore: number
    }
  | {
      valid: false
      score: null
      maxScore: number
      message: string
    }

export function validateEvaluationMaxScore(
  value: number
): {
  valid: boolean
  message?: string
} {
  if (!Number.isFinite(value) || value < 1 || value > 20) {
    return {
      valid: false,
      message:
        'La note maximale doit être comprise entre 1 et 20.'
    }
  }

  return { valid: true }
}

export function validateGrade(
  value: string | number | null | undefined,
  evaluationMaxScore: number,
  studentName?: string
): GradeValidationResult {
  const maxScore = Math.min(
    Math.max(Number(evaluationMaxScore), 0),
    20
  )

  // Une note vide est autorisée.
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return {
      valid: true,
      score: null,
      maxScore
    }
  }

  const score =
    typeof value === 'number'
      ? value
      : Number(value)

  if (
    !Number.isFinite(score) ||
    score < 0 ||
    score > 20 ||
    score > maxScore
  ) {
    const name = studentName
      ? ` pour ${studentName}`
      : ''

    return {
      valid: false,
      score: null,
      maxScore,
      message:
        `Note invalide${name}. ` +
        `Elle doit être comprise entre 0 et ${maxScore}.`
    }
  }

  return {
    valid: true,
    score,
    maxScore
  }
}