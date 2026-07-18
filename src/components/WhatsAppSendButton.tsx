import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getStudentBulletinBlob } from '@/lib/exports'
import type { Profile } from '@/types/database'

interface Props {
  studentId: string
  studentName: string
  classId: string
  className: string
  profile: Profile | null
  parentWhatsapp: string | null
  onNumberUpdated?: (newNumber: string) => void
}

function buildMessage(studentName: string, className: string, schoolName: string) {
  return `Bonjour, voici le bulletin de notes de ${studentName} (classe ${className}) - ${schoolName}. Merci de votre confiance.`
}

export default function WhatsAppSendButton({
  studentId,
  studentName,
  classId,
  className,
  profile,
  parentWhatsapp,
  onNumberUpdated
}: Props) {
  const [number, setNumber] = useState(parentWhatsapp ?? '')
  const [editing, setEditing] = useState(!parentWhatsapp)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveNumber() {
    const cleaned = number.replace(/\s+/g, '')
    if (!cleaned) {
      setError('Numéro requis')
      return
    }
    const { error: updateError } = await supabase
      .from('students')
      .update({ parent_whatsapp: cleaned })
      .eq('id', studentId)

    if (updateError) {
      setError('Erreur lors de l\'enregistrement du numéro')
      return
    }
    setEditing(false)
    setError(null)
    onNumberUpdated?.(cleaned)
  }

  async function handleSend() {
    if (!number) {
      setError('Ajoute un numéro WhatsApp avant d\'envoyer')
      return
    }
    setSending(true)
    setError(null)

    try {
      const { blob, fileName } = await getStudentBulletinBlob(
        studentId,
        studentName,
        classId,
        className,
        profile
      )
      const message = buildMessage(studentName, className, profile?.school_name ?? 'École')
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

        const cleanNumber = number.replace(/\D/g, '')
        const waUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`
        window.open(waUrl, '_blank')
      }

      await supabase.from('whatsapp_history').insert({
        teacher_id: profile?.id,
        student_id: studentId,
        class_id: classId,
        message_type: 'bulletin_individuel',
        message_content: message,
        parent_whatsapp: number,
        status,
        share_method: shareMethod,
        error_message: errorMessage
      })

      if (status === 'failed') setError(errorMessage)
    } catch (err: any) {
      setError(err?.message ?? 'Erreur lors de l\'envoi')
      await supabase.from('whatsapp_history').insert({
        teacher_id: profile?.id,
        student_id: studentId,
        class_id: classId,
        message_type: 'bulletin_individuel',
        message_content: '',
        parent_whatsapp: number,
        status: 'failed',
        error_message: err?.message ?? 'Erreur inconnue'
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {editing ? (
        <div className="flex gap-2 items-center">
          <input
            type="tel"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Ex: 22997000000"
            className="border rounded px-3 py-2 text-sm flex-1"
          />
          <button
            onClick={saveNumber}
            className="bg-primary-600 text-white text-sm px-3 py-2 rounded"
          >
            Enregistrer
          </button>
        </div>
      ) : (
        <div className="flex gap-2 items-center">
          <span className="text-sm text-gray-600">Parent : {number}</span>
          <button onClick={() => setEditing(true)} className="text-xs text-primary-600 underline">
            Modifier
          </button>
        </div>
      )}

      <button
        onClick={handleSend}
        disabled={sending || editing}
        className="bg-green-600 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
      >
        {sending ? 'Envoi en cours...' : 'Envoyer le bulletin via WhatsApp'}
      </button>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
