import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { getStudentBulletinBlob } from '@/lib/exports'

interface HistoryEntry {
  id: string
  student_id: string
  class_id: string | null
  message_type: string
  message_content: string
  parent_whatsapp: string
  status: 'pending' | 'sent' | 'failed'
  share_method: string | null
  error_message: string | null
  sent_at: string
  student_name: string
  class_name: string
}

export default function WhatsAppHistory() {
  const { profile } = useAuth()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'sent' | 'failed'>('all')
  const [resendingId, setResendingId] = useState<string | null>(null)

  useEffect(() => {
    void loadHistory()
  }, [])

  async function loadHistory() {
    setLoading(true)
    const { data } = await supabase
      .from('whatsapp_history')
      .select('*, students(last_name, first_name), classes(name)')
      .order('sent_at', { ascending: false })
      .limit(200)

    const rows: HistoryEntry[] = (data ?? []).map((r: any) => ({
      id: r.id,
      student_id: r.student_id,
      class_id: r.class_id,
      message_type: r.message_type,
      message_content: r.message_content,
      parent_whatsapp: r.parent_whatsapp,
      status: r.status,
      share_method: r.share_method,
      error_message: r.error_message,
      sent_at: r.sent_at,
      student_name: r.students ? `${r.students.last_name} ${r.students.first_name}` : 'Élève supprimé',
      class_name: r.classes?.name ?? ''
    }))
    setEntries(rows)
    setLoading(false)
  }

  async function handleResend(entry: HistoryEntry) {
    if (!entry.class_id) return
    setResendingId(entry.id)
    try {
      const { blob, fileName } = await getStudentBulletinBlob(
        entry.student_id,
        entry.student_name,
        entry.class_id,
        entry.class_name,
        profile
      )
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
          await navigator.share({ files: [file], text: entry.message_content })
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

        const cleanNumber = entry.parent_whatsapp.replace(/\D/g, '')
        const waUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(entry.message_content)}`
        window.open(waUrl, '_blank')
      }

      await supabase.from('whatsapp_history').insert({
        teacher_id: profile?.id,
        student_id: entry.student_id,
        class_id: entry.class_id,
        message_type: entry.message_type,
        message_content: entry.message_content,
        parent_whatsapp: entry.parent_whatsapp,
        status,
        share_method: shareMethod,
        error_message: errorMessage
      })

      void loadHistory()
    } catch (err) {
      console.error('[WhatsApp] Erreur lors du renvoi :', err)
    } finally {
      setResendingId(null)
    }
  }

  const filtered = entries.filter((e) => filter === 'all' || e.status === filter)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-primary-800">Historique des envois WhatsApp</h1>

      <div className="flex gap-2">
        {(['all', 'sent', 'failed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full ${filter === f ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-600'}`}
          >
            {f === 'all' ? 'Tous' : f === 'sent' ? 'Envoyés' : 'Échecs'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-primary-400">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-primary-400">Aucun envoi enregistré.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <div key={e.id} className="card flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                {e.status === 'sent' ? (
                  <CheckCircle2 size={18} className="text-success mt-0.5 shrink-0" />
                ) : (
                  <XCircle size={18} className="text-danger mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary-800 truncate">{e.student_name}</p>
                  <p className="text-xs text-primary-400">
                    {e.class_name} · {new Date(e.sent_at).toLocaleString('fr-FR')}
                  </p>
                  {e.status === 'failed' && e.error_message && (
                    <p className="text-xs text-danger truncate">{e.error_message}</p>
                  )}
                </div>
              </div>
              {e.status === 'failed' && e.class_id && (
                <button
                  onClick={() => handleResend(e)}
                  disabled={resendingId === e.id}
                  className="btn-secondary flex items-center gap-1 text-xs py-1.5 px-2 shrink-0"
                >
                  <RotateCcw size={14} />
                  {resendingId === e.id ? '...' : 'Renvoyer'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
