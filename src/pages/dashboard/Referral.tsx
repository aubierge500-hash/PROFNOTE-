import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, Gift, MessageCircle, Wallet } from 'lucide-react'
import {
  REFERRAL_MIN_WITHDRAWAL_FCFA,
  REFERRAL_REWARD_FCFA,
  buildReferralLink,
  buildWhatsAppShareUrl,
  fetchMyWithdrawals,
  fetchReferralStats,
  requestWithdrawal,
  type ReferralStats,
  type ReferralWithdrawal
} from '@/lib/referral'

const STATUS_LABEL: Record<ReferralWithdrawal['status'], string> = {
  pending: 'En cours de traitement',
  paid: 'Payé',
  rejected: 'Refusé'
}

const STATUS_STYLE: Record<ReferralWithdrawal['status'], string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  paid: 'bg-green-50 text-green-800 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200'
}

function formatFcfa(value: number) {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR')
}

export default function Referral() {
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [withdrawals, setWithdrawals] = useState<ReferralWithdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const [statsResult, history] = await Promise.all([fetchReferralStats(), fetchMyWithdrawals()])

    if (statsResult.error) setError(statsResult.error)
    setStats(statsResult.data)
    setWithdrawals(history)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function copy(kind: 'code' | 'link') {
    if (!stats) return
    const text = kind === 'code' ? stats.code : buildReferralLink(stats.code)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      window.prompt('Copiez ce texte :', text)
    }
  }

  async function handleWithdraw(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!navigator.onLine) {
      setError('Une demande de retrait nécessite internet.')
      return
    }

    setSubmitting(true)
    const result = await requestWithdrawal(phone)
    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSuccess(
      `Demande envoyée : ${formatFcfa(result.amount ?? 0)} vous seront envoyés par Mobile Money dès que l'administration l'aura traitée.`
    )
    setPhone('')
    await load()
  }

  if (loading && !stats) {
    return <div className="p-8 text-center text-primary-600">Chargement de votre parrainage…</div>
  }

  const waiting = stats ? Math.max(stats.signedUp - stats.qualified, 0) : 0
  const canWithdraw = !!stats && stats.available >= REFERRAL_MIN_WITHDRAWAL_FCFA && !stats.pendingRequest
  const toMinimum = stats ? Math.max(REFERRAL_MIN_WITHDRAWAL_FCFA - stats.available, 0) : REFERRAL_MIN_WITHDRAWAL_FCFA
  const withdrawProgress = stats
    ? Math.min((stats.available / REFERRAL_MIN_WITHDRAWAL_FCFA) * 100, 100)
    : 0

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-display font-bold text-primary-800 flex items-center gap-2">
          <Gift size={24} /> Parrainage
        </h1>
        <p className="text-sm text-primary-600 mt-2">
          Pour chaque collègue que vous parrainez, vous gagnez {REFERRAL_REWARD_FCFA} FCFA. Vous pouvez retirer vos
          gains dès que vous atteignez {REFERRAL_MIN_WITHDRAWAL_FCFA} FCFA.
        </p>
        <p className="text-xs text-primary-500 mt-1">
          Un collègue est compté quand son abonnement est activé (après son premier paiement).
        </p>
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {success}
        </div>
      )}

      {stats && (
        <>
          <section className="card space-y-4">
            <div>
              <p className="text-sm font-medium text-primary-700">Votre code de parrainage</p>
              <p className="mt-1 text-3xl font-bold tracking-widest text-primary-800 select-all">{stats.code}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href={buildWhatsAppShareUrl(stats.code)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary flex items-center justify-center gap-2"
              >
                <MessageCircle size={18} /> Partager sur WhatsApp
              </a>
              <button type="button" onClick={() => void copy('link')} className="btn-secondary flex items-center justify-center gap-2">
                {copied === 'link' ? <Check size={18} /> : <Copy size={18} />}
                {copied === 'link' ? 'Lien copié' : 'Copier mon lien'}
              </button>
              <button type="button" onClick={() => void copy('code')} className="btn-secondary flex items-center justify-center gap-2">
                {copied === 'code' ? <Check size={18} /> : <Copy size={18} />}
                {copied === 'code' ? 'Code copié' : 'Copier le code'}
              </button>
            </div>
          </section>

          <section className="card space-y-3">
            <p className="text-sm font-medium text-primary-700">Vos collègues parrainés</p>

            <dl className="grid grid-cols-3 gap-3 pt-2 text-center">
              <div className="rounded-lg bg-primary-50 p-3">
                <dt className="text-xs text-primary-500">Inscrits</dt>
                <dd className="text-xl font-bold text-primary-800">{stats.signedUp}</dd>
              </div>
              <div className="rounded-lg bg-primary-50 p-3">
                <dt className="text-xs text-primary-500">Comptés</dt>
                <dd className="text-xl font-bold text-primary-800">{stats.qualified}</dd>
              </div>
              <div className="rounded-lg bg-primary-50 p-3">
                <dt className="text-xs text-primary-500">En attente</dt>
                <dd className="text-xl font-bold text-primary-800">{waiting}</dd>
              </div>
            </dl>
          </section>

          <section className="card space-y-4">
            <p className="text-sm font-medium text-primary-700 flex items-center gap-2">
              <Wallet size={18} /> Mes gains
            </p>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-primary-50 p-3">
                <p className="text-xs text-primary-500">Gagné</p>
                <p className="text-base font-bold text-primary-800">{formatFcfa(stats.earned)}</p>
              </div>
              <div className="rounded-lg bg-primary-50 p-3">
                <p className="text-xs text-primary-500">Déjà retiré</p>
                <p className="text-base font-bold text-primary-800">{formatFcfa(stats.withdrawn)}</p>
              </div>
              <div className="rounded-lg bg-primary-100 p-3">
                <p className="text-xs text-primary-600">Disponible</p>
                <p className="text-base font-bold text-primary-800">{formatFcfa(stats.available)}</p>
              </div>
            </div>

            <div>
              <div className="h-2 rounded-full bg-primary-100 overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${withdrawProgress}%` }} />
              </div>
              <p className="mt-1 text-xs text-primary-500">
                {stats.available >= REFERRAL_MIN_WITHDRAWAL_FCFA
                  ? 'Vous pouvez demander un retrait.'
                  : `Retrait possible dès ${REFERRAL_MIN_WITHDRAWAL_FCFA} FCFA — il vous manque ${formatFcfa(toMinimum)}.`}
              </p>
            </div>

            {stats.pendingRequest ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Une demande de retrait est en cours de traitement.
              </p>
            ) : (
              <form onSubmit={handleWithdraw} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-primary-700 mb-1">
                    Numéro Mobile Money pour recevoir vos gains
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    required
                    disabled={!canWithdraw}
                    className="input-field"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex : 01 29 59 53 10"
                  />
                </div>
                <button type="submit" disabled={!canWithdraw || submitting} className="btn-primary w-full">
                  {submitting ? 'Envoi…' : `Retirer ${formatFcfa(stats.available)}`}
                </button>
              </form>
            )}
          </section>
        </>
      )}

      {withdrawals.length > 0 && (
        <section className="card space-y-3">
          <p className="text-sm font-medium text-primary-700">Historique des retraits</p>
          <ul className="space-y-2">
            {withdrawals.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 rounded-lg border border-primary-100 p-3">
                <div className="min-w-0">
                  <p className="font-semibold text-primary-800">{formatFcfa(w.amount)}</p>
                  <p className="text-xs text-primary-500">
                    {formatDate(w.created_at)} · {w.phone}
                  </p>
                  {w.status === 'rejected' && w.note && <p className="text-xs text-red-700 mt-1">{w.note}</p>}
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLE[w.status]}`}>
                  {STATUS_LABEL[w.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
