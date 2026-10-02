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

function buildMessage(
  studentName: string,
  className: string,
  schoolName: string
) {
  return `Bonjour, voici le bulletin de notes de ${studentName} (classe ${className}) - ${schoolName}. Merci de votre confiance.`
}

export default function ClassWhatsAppSendButton({
  classId,
  className,
  profile
}: Props) {
  const [open, setOpen] = useState(false)
  const [students, setStudents] = useState<StudentTarget[]>([])
  const [index, setIndex] = useState(0)
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<
    Record<string, 'sent' | 'failed' | 'skipped'>
  >({})
  const [loadingList, setLoadingList] = useState(false)

  async function openModal() {
    setLoadingList(true)

    const { data, error } = await supabase
      .from('students')
      .select(
        'id, first_name, last_name, parent_whatsapp'
      )
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('last_name')
      .order('first_name')

    if (error) {
      console.error(
        '[ClassWhatsAppSendButton] Erreur chargement élèves :',
        error
      )

      setLoadingList(false)
      return
    }

    const list: StudentTarget[] = (data ?? []).map(
      (student: any) => ({
        id: student.id,
        name: `${student.last_name} ${student.first_name}`,
        parent_whatsapp: student.parent_whatsapp
      })
    )

    setStudents(list)
    setIndex(0)
    setResults({})
    setLoadingList(false)
    setOpen(true)
  }

  async function sendCurrent() {
    const student = students[index]

    if (!student) return

    if (!student.parent_whatsapp) {
      setResults((current) => ({
        ...current,
        [student.id]: 'skipped'
      }))

      return
    }

    setSending(true)

    try {
      const {
        blob,
        fileName
      } = await getStudentBulletinBlob(
        student.id,
        student.name,
        classId,
        className,
        profile
      )

      /*
       * Téléchargement du bulletin.
       * Le PDF est enregistré sur l'appareil afin que
       * l'utilisateur puisse ensuite le joindre dans WhatsApp.
       */
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()

      /*
       * On attend un court instant avant de libérer l'URL.
       */
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 2000)

      const cleanNumber =
        student.parent_whatsapp.replace(/\D/g, '')

      if (!cleanNumber) {
        throw new Error(
          'Le numéro WhatsApp du parent est invalide.'
        )
      }

      const message = buildMessage(
        student.name,
        className,
        profile?.school_name ?? 'École'
      )

      /*
       * Ouverture directe de WhatsApp.
       * Aucun navigator.share() ici.
       */
      const waUrl =
        `https://wa.me/${cleanNumber}?text=` +
        encodeURIComponent(message)

      window.open(waUrl, '_blank')

      /*
       * Historique de l'envoi.
       */
      await supabase
        .from('whatsapp_history')
        .insert({
          teacher_id: profile?.id ?? null,
          student_id: student.id,
          class_id: classId,
          message_type: 'bulletin_classe',
          message_content: message,
          parent_whatsapp: student.parent_whatsapp,
          status: 'sent',
          share_method: 'wa_link_fallback',
          error_message: null
        })

      setResults((current) => ({
        ...current,
        [student.id]: 'sent'
      }))
    } catch (error: any) {
      console.error(
        '[ClassWhatsAppSendButton] Erreur envoi :',
        error
      )

      const errorMessage =
        error?.message ??
        'Impossible de préparer le bulletin.'

      setResults((current) => ({
        ...current,
        [student.id]: 'failed'
      }))

      await supabase
        .from('whatsapp_history')
        .insert({
          teacher_id: profile?.id ?? null,
          student_id: student.id,
          class_id: classId,
          message_type: 'bulletin_classe',
          message_content: '',
          parent_whatsapp: student.parent_whatsapp,
          status: 'failed',
          share_method: 'wa_link_fallback',
          error_message: errorMessage
        })
    } finally {
      setSending(false)
    }
  }

  function goNext() {
    setIndex((current) => current + 1)
  }

  function closeModal() {
    if (sending) return

    setOpen(false)
    setStudents([])
    setIndex(0)
    setResults({})
  }

  const current = students[index]
  const done =
    students.length > 0 && index >= students.length

  const sentCount = Object.values(results).filter(
    (status) => status === 'sent'
  ).length

  const failedCount = Object.values(results).filter(
    (status) => status === 'failed'
  ).length

  const skippedCount = Object.values(results).filter(
    (status) => status === 'skipped'
  ).length

  return (
    <>
      <button
        type="button"
        onClick={() => void openModal()}
        disabled={loadingList}
        className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 disabled:opacity-50"
      >
        {loadingList
          ? 'Chargement…'
          : 'Envoyer à la classe (WhatsApp)'}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-primary-800">
                Envoi WhatsApp — {className}
              </h3>

              <button
                type="button"
                onClick={closeModal}
                disabled={sending}
                className="text-primary-400 hover:text-primary-700"
              >
                ×
              </button>
            </div>

            {!done && current ? (
              <>
                <div>
                  <p className="text-sm text-primary-600">
                    Élève {index + 1}/{students.length}
                  </p>

                  <p className="font-medium text-primary-800 mt-1">
                    {current.name}
                  </p>
                </div>

                {!current.parent_whatsapp ? (
                  <div className="bg-primary-50 rounded-lg p-3">
                    <p className="text-xs text-primary-500">
                      Aucun numéro WhatsApp enregistré
                      pour ce parent.
                    </p>
                  </div>
                ) : (
                  <div className="bg-primary-50 rounded-lg p-3">
                    <p className="text-xs text-primary-500">
                      Parent
                    </p>

                    <p className="text-sm font-medium text-primary-800">
                      {current.parent_whatsapp}
                    </p>
                  </div>
                )}

                <div className="bg-primary-50 rounded-lg p-3">
                  <p className="text-xs text-primary-500">
                    Fonctionnement
                  </p>

                  <p className="text-xs text-primary-600 mt-1">
                    Le bulletin PDF sera téléchargé sur
                    votre téléphone, puis WhatsApp sera
                    ouvert avec le message déjà préparé.
                  </p>
                </div>

                <div className="flex gap-2">
                  {current.parent_whatsapp ? (
                    <button
                      type="button"
                      onClick={() => void sendCurrent()}
                      disabled={sending}
                      className="btn-primary text-sm flex-1 disabled:opacity-50"
                    >
                      {sending
                        ? 'Préparation…'
                        : 'Préparer et ouvrir WhatsApp'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={goNext}
                      className="btn-primary text-sm flex-1"
                    >
                      Passer
                    </button>
                  )}

                  {results[current.id] && (
                    <button
                      type="button"
                      onClick={goNext}
                      disabled={sending}
                      className="btn-secondary text-sm"
                    >
                      Suivant
                    </button>
                  )}
                </div>

                {results[current.id] === 'sent' && (
                  <p className="text-xs text-green-600">
                    Bulletin préparé et WhatsApp ouvert.
                    Joignez le PDF téléchargé avant d'envoyer.
                  </p>
                )}

                {results[current.id] === 'failed' && (
                  <p className="text-xs text-red-600">
                    Une erreur est survenue lors de la
                    préparation du bulletin.
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="bg-primary-50 rounded-lg p-3">
                  <p className="text-sm text-primary-700">
                    Traitement terminé.
                  </p>

                  <div className="text-xs text-primary-500 mt-2 space-y-1">
                    <p>
                      {sentCount} bulletin
                      {sentCount > 1 ? 's' : ''} préparé
                      {sentCount > 1 ? 's' : ''}
                    </p>

                    <p>
                      {failedCount} échec
                      {failedCount > 1 ? 's' : ''}
                    </p>

                    <p>
                      {skippedCount} élève
                      {skippedCount > 1 ? 's' : ''} sans
                      numéro
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="btn-primary text-sm w-full"
                >
                  Fermer
                </button>
              </div>
            )}

            {!done && (
              <button
                type="button"
                onClick={closeModal}
                disabled={sending}
                className="text-xs text-primary-400 underline block mx-auto disabled:opacity-50"
              >
                Fermer sans terminer
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}