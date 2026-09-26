import { useRef, useState } from 'react'
import { Camera, Upload, RotateCcw } from 'lucide-react'
import { studentCopyScanner } from '@/lib/ocr'
import type { StudentCopyScanResult } from '@/lib/ocr/StudentCopyScanner'

export default function Scanner() {
  const inputRef = useRef<HTMLInputElement>(null)

  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<StudentCopyScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setScanning(true)
    setProgress(0)
    setResult(null)
    setError(null)

    try {
      const scanResult = await studentCopyScanner.scan(
        file,
        setProgress
      )

      setResult(scanResult)
    } catch (err: any) {
      console.error('Erreur scanner:', err)

      setError(
        err?.message ??
          'Impossible d’analyser cette copie.'
      )
    } finally {
      setScanning(false)
    }
  }

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]

    if (file) {
      void handleFile(file)
    }
  }

  function reset() {
    setResult(null)
    setError(null)
    setProgress(0)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-display font-semibold text-primary-800">
          Scanner une copie
        </h1>

        <p className="text-sm text-primary-500 mt-1">
          Photographiez une copie corrigée pour détecter
          automatiquement le nom et la note finale.
        </p>
      </div>

      <div className="card space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleChange}
          className="hidden"
        />

        {!scanning && !result && (
          <button
            onClick={() => inputRef.current?.click()}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Camera size={19} />
            Photographier une copie
          </button>
        )}

        {!scanning && !result && (
          <button
            onClick={() => inputRef.current?.click()}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Upload size={18} />
            Choisir une photo
          </button>
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
            <div className="rounded-lg bg-primary-50 p-4 space-y-3">
              <div>
                <p className="text-xs text-primary-400">
                  Nom détecté
                </p>

                <p className="font-semibold text-primary-800">
                  {result.name || 'Non détecté'}
                </p>
              </div>

              <div>
                <p className="text-xs text-primary-400">
                  Note détectée
                </p>

                <p className="text-2xl font-bold text-primary-800">
                  {result.grade || 'Non détectée'}
                </p>
              </div>
            </div>

            <div className="text-xs text-primary-400 space-y-1">
              <p>
                Confiance nom :{' '}
                {Math.round(result.nameConfidence)} %
              </p>

              <p>
                Confiance note :{' '}
                {Math.round(result.gradeConfidence)} %
              </p>
            </div>

            <button
              onClick={reset}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <RotateCcw size={17} />
              Scanner une autre copie
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-accent/10 border border-accent/20 p-3 text-xs text-primary-600">
        <strong>Conseil :</strong> placez la copie entière dans
        le cadre, avec la note rouge bien visible en haut et le
        nom visible dans la marge gauche.
      </div>
    </div>
  )
}