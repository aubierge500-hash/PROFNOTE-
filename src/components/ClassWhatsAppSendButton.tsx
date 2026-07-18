import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getStudentBulletinBlob } from '@/lib/exports'
import type { Profile } from '@/types/database'

interface StudentTarget {
  id: string
  name: string
  parent_whatsapp: string | null
}

interface Props {
  classId: string
  className: string
  profile: Profile | null
}

function buildMessage(studentName: string, className: string, schoolName: string) {
  return `Bonjour, voici le bulletin de notes de ${studentName} (classe ${className}) - ${schoolName}. Merci de votre confiance.`
}

export default function ClassWhatsAppSendButton({ classId, className, profile }: Props) {
  const [open, setOpen] = useState(false)
  const [students, setStudents] = useState<StudentTarget[]>([])
  const [index, setIndex] = useState(0)
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<Record<string, 'sent' | 'failed' | 'skipped'>>({})
  const [loadingList, setLoadingList] = useState(false)

  async function openModal() {
    setLoadingList(true)
    const { data } = await supabase
      .from('students')
      .select('id, first_name, last_name, parent_whatsapp')
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('last_name')

    const list: StudentTarget[] = (data ?? []).map((s: any) => ({
      id: s.id,
      name: `${s.last_name} ${s.first_name}`,
      parent_whatsapp: s.parent_whatsapp
    }))
    setStudents(list)
    setIndex(0)
    setResults({})
    setLoadingList(false)
    setOpen(true)
  }

  async function sendCurrent() {
    const student = students[index]
    if (!student || !student.parent_whatsapp) return

    setSending(true)
    try {
      const { blob, fileName } = await getStudentBulletinBlob(
        student.id,
        student.name,
        classId,
        className,
        profile
      )
      const message = buildMessage(student.name, className, profile?.school_name ?? 'École')
      const file = new File([blob], fileName, { type: 'application/pdf' })

      let status: 'sent' | 'failed' = 'sent'
      let shareMethod: 'web_share' | 'wa_link_fallback' = 'web_share'
      let errorMessage: string | null = null

      const canUseWebShare =
        typeof navigator !== 'undefined' &&
        'share' in navigator &&
        'canShare' in navigator &&
        navigator.canShare({ files: [file] })

      if (canUseWebShare) {
        try {
          await navigator.share({ files: [file], text: message })
        } catch (shareErr: any) {
          if (shareErr?.name !== 'AbortError') {
            status = 'failed'
            errorMessage = shareErr?.message ?? 'Partage annulé'
          }
        }
      } else {
        shareMethod = 'wa_link_fallback'
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = fileName
        link.click()
        URL.revokeObjectURL(link.href)

        const cleanNumber = student.parent_whatsapp.replace(/\D/g, '')
        const waUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`
        window.open(waUrl, '_blank')
      }

      await supabase.from('whatsapp_history').insert({
        teacher_id: profile?.id,
        student_id: student.id,
        class_id: classId,
        message_type: 'bulletin_classe',
        message_content: message,
        parent_whatsapp: student.parent_whatsapp,
        status,
        share_method: shareMethod,
        error_message: errorMessage
      })

      setResults((r) => ({ ...r, [student.id]: status === 'sent' ? 'sent' : 'failed' }))
    } catch (err: any) {
      setResults((r) => ({ ...r, [student.id]: 'failed' }))
      await supabase.from('whatsapp_history').insert({
        teacher_id: profile?.id,
        student_id: student.id,
        class_id: classId,
        message_type: 'bulletin_classe',
        message_content: '',
        parent_whatsapp: student.parent_whatsapp,
        status: 'failed',
        error_message: err?.message ?? 'Erreur inconnue'
      })
    } finally {
      setSending(false)
    }
  }

  function goNext() {
    setIndex((i) => i + 1)
  }

  const current = students[index]
  const done = index >= students.length
  const sentCount = Object.values(results).filter((s) => s === 'sent').length
  const failedCount = Object.values(results).filter((s) => s === 'failed').length
  const skippedCount = Object.values(results).filter((s) => s === 'skipped').length

  return (
    <>
      <button
        onClick={openModal}
        disabled={loadingList}
        className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
      >
        {loadingList ? 'Chargement…' : 'Envoyer à la classe (WhatsApp)'}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 w-full max-w-sm space-y-3">
            <h3 className="font-semibold text-primary-800">Envoi WhatsApp — {className}</h3>

            {!done && current ? (
              <>
                <p className="text-sm text-primary-600">
                  Élève {index + 1}/{students.length} : <span className="font-medium">{current.name}</span>
                </p>
                {!current.parent_whatsapp ? (
                  <p className="text-xs text-primary-400">Aucun numéro WhatsApp enregistré — élève ignoré.</p>
                ) : (
                  <p className="text-xs text-primary-400">Parent : {current.parent_whatsapp}</p>
                )}

                <div className="flex gap-2">
                  {current.parent_whatsapp ? (
                    <button onClick={sendCurrent} disabled={sending} className="btn-primary text-sm flex-1">
                      {sending ? 'Envoi…' : 'Envoyer'}
                    </button>
                  ) : (
                    <button onClick={goNext} className="btn-primary text-sm flex-1">
                      Passer
                    </button>
                  )}
                  {results[current.id] && (
                    <button onClick={goNext} className="btn-secondary text-sm">
                      Suivant
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-primary-700">
                  Terminé : {sentCount} envoyé(s), {failedCount} échec(s), {skippedCount} sans numéro.
                </p>
                <button onClick={() => setOpen(false)} className="btn-primary text-sm w-full">
                  Fermer
                </button>
              </div>
            )}

            {!done && (
              <button onClick={() => setOpen(false)} className="text-xs text-primary-400 underline block mt-1">
                Fermer sans terminer
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
