import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, Upload, RotateCcw, Check, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { studentCopyScanner } from '@/lib/ocr'
import type { StudentCopyScanResult } from '@/lib/ocr/StudentCopyScanner'
import type { SchoolClass, Student } from '@/types/database'

interface ValidatedCopy {
  studentId: string
  name: string
  grade: string
}

function studentLabel(s: Student): string {
  return `${s.last_name} ${s.first_name ?? ''}`.trim()
}

function normalizeGrade(text: string): string {
  return text.replace(/\s+/g, '').replace(',', '.')
}

function isValidGrade(text: string): boolean {
  return /^\d{1,3}(\.\d{1,2})?(\/\d{1,3})?$/.test(normalizeGrade(text))
}

export default function Scanner() {
  const { user } = useAuth()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [students, setStudents] = useState<Student[]>([])

  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<StudentCopyScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [studentId, setStudentId] = useState('')
  const [gradeText, setGradeText] = useState('')
  const [validated, setValidated] = useState<ValidatedCopy[]>([])

  useEffect(() => {
    if (!user) return

    void (async () => {
      const { data } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('is_archived', false)
        .order('name')

      const list = (data as SchoolClass[]) ?? []

      setClasses(list)

      if (list.length > 0) {
        setSelectedClass(list[0].id)
      }
    })()
  }, [user])

  useEffect(() => {
    if (!user || !selectedClass) return

    void (async () => {
      const { data } = await supabase
        .from('students')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('is_active', true)
        .eq('class_id', selectedClass)
        .order('last_name')

      setStudents((data as Student[]) ?? [])
    })()
  }, [user, selectedClass])

  async function handleFile(file: File) {
    setScanning(true)
    setProgress(0)
    setResult(null)
    setError(null)
    setStudentId('')
    setGradeText('')

    try {
      const scanResult = await studentCopyScanner.scan(file, setProgress, {
        students: students.map(studentLabel)
      })

      setResult(scanResult)
      setGradeText(scanResult.grade)

      const matched = scanResult.matchedStudent
      const found = matched
        ? students.find((s) => studentLabel(s) === matched)
        : undefined

      setStudentId(found ? found.id : '')
    } catch (err: unknown) {
      console.error('Erreur scanner:', err)

      setError(
        err instanceof Error && err.message
          ? err.message
          : `Impossible d'analyser cette copie.`
      )
    } finally {
      setScanning(false)
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    // Permet de choisir de nouveau la même photo
    event.target.value = ''

    if (file) {
      void handleFile(file)
    }
  }

  function reset() {
    setResult(null)
    setError(null)
    setProgress(0)
    setStudentId('')
    setGradeText('')
  }

  function handleClassChange(id: string) {
    setSelectedClass(id)
    reset()
  }

  function validate() {
    const student = students.find((s) => s.id === studentId)

    if (!student || !isValidGrade(gradeText)) return

    const entry: ValidatedCopy = {
      studentId: student.id,
      name: studentLabel(student),
      grade: normalizeGrade(gradeText)
    }

    setValidated((prev) => [
      ...prev.filter((v) => v.studentId !== student.id),
      entry
    ])

    reset()
  }

  const suggestedStudents = result
    ? result.nameSuggestions
        .map((m) => students.find((s) => studentLabel(s) === m.name))
        .filter((s): s is Student => s !== undefined)
    : []

  const canValidate = studentId !== '' && isValidGrade(gradeText)
  const canScan = !scanning && selectedClass !== ''

  return (
    <div className="space-y-5 w-full min-w-0">
      <div>
        <h1 className="text-2xl font-display font-semibold text-primary-800">
          Scanner une copie
        </h1>

        <p className="text-sm text-primary-500 mt-1">
          Photographiez une copie corrigée pour détecter le nom et la note
          finale.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="space-y-1">
          <label className="text-xs text-primary-400">Classe</label>

          <select
            className="input-field w-full"
            value={selectedClass}
            disabled={scanning}
            onChange={(e) => handleClassChange(e.target.value)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Caméra */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleChange}
          className="hidden"
        />

        {/* Galerie : pas d'attribut capture */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          onChange={handleChange}
          className="hidden"
        />

        {!scanning && !result && (
          <div className="space-y-3">
            <button
              onClick={() => cameraRef.current?.click()}
              disabled={!canScan}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Camera size={19} />
              Photographier une copie
            </button>

            <button
              onClick={() => galleryRef.current?.click()}
              disabled={!canScan}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Upload size={18} />
              Choisir une photo
            </button>
          </div>
        )}

        {scanning && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-primary-700">
              Analyse de la copie…
            </p>

            <div className="w-full h-2 rounded-full bg-primary-100 overflow-hidden">
              <div
                className="h-full bg-primary-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="text-xs text-primary-400 text-center">
              {progress} %
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {result.warnings.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800 space-y-1">
                {result.warnings.map((w) => (
                  <p key={w} className="flex gap-2">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </p>
                ))}
              </div>
            )}

            {/* Élève */}
            <div className="space-y-2">
              <label className="text-xs text-primary-400">Élève</label>

              <select
                className="input-field w-full"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="">— Choisir l'élève —</option>

                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {studentLabel(s)}
                  </option>
                ))}
              </select>

              {suggestedStudents.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestedStudents.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStudentId(s.id)}
                      className={`text-xs rounded-full border px-3 py-1 ${
                        studentId === s.id
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'border-primary-200 text-primary-700'
                      }`}
                    >
                      {studentLabel(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Note */}
            <div className="space-y-2">
              <label className="text-xs text-primary-400">
                Note (modifiable)
              </label>

              <input
                className="input-field w-full text-xl font-bold"
                inputMode="decimal"
                placeholder="ex. 14.5/20"
                value={gradeText}
                onChange={(e) => setGradeText(e.target.value)}
              />

              {result.candidates.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {result.candidates.map((c, i) => (
                    <button
                      key={`${c.value}-${i}`}
                      onClick={() => setGradeText(c.value)}
                      className={`text-xs rounded-full border px-3 py-1 ${
                        gradeText === c.value
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'border-primary-200 text-primary-700'
                      }`}
                    >
                      {c.value}
                    </button>
                  ))}
                </div>
              )}

              {result.subScores.length > 0 && (
                <p className="text-xs text-primary-400">
                  Sous-notes lues :{' '}
                  {result.subScores
                    .map((s) => `${s.label} = ${s.value}`)
                    .join(' · ')}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={validate}
                disabled={!canValidate}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Check size={18} />
                Valider
              </button>

              <button
                onClick={reset}
                className="btn-secondary flex items-center justify-center gap-2"
              >
                <RotateCcw size={17} />
                Refaire
              </button>
            </div>

            <details className="text-xs text-primary-400">
              <summary className="cursor-pointer">
                Voir ce que l'appli a lu
              </summary>

              <div className="mt-2 space-y-2">
                <p>
                  Sens de la photo : {result.debug.rotation}° · Libellés
                  trouvés : {result.debug.labelsFound.join(', ') || 'aucun'} ·
                  Note entourée : {result.debug.ringFound ? 'oui' : 'non'}
                </p>

                {result.debug.gradeImage && (
                  <img
                    src={result.debug.gradeImage}
                    alt="Zone de la note"
                    className="max-w-full border border-primary-100 rounded"
                  />
                )}

                {result.debug.nameImage && (
                  <img
                    src={result.debug.nameImage}
                    alt="Zone du nom"
                    className="max-w-full border border-primary-100 rounded"
                  />
                )}
              </div>
            </details>
          </div>
        )}
      </div>

      {validated.length > 0 && (
        <div className="card space-y-2">
          <p className="text-sm font-medium text-primary-700">
            Copies validées ({validated.length})
          </p>

          <div className="divide-y divide-primary-100">
            {validated.map((v) => (
              <div
                key={v.studentId}
                className="py-2 flex items-center justify-between text-sm"
              >
                <span className="text-primary-800">{v.name}</span>
                <span className="font-semibold text-primary-800">
                  {v.grade}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-accent/10 border border-accent/20 p-3 text-xs text-primary-600">
        <strong>Conseil :</strong> placez la copie entière dans le cadre, avec
        la note rouge bien visible en haut et le nom lisible. Photographiez
        avec une bonne lumière.
      </div>
    </div>
  )
}