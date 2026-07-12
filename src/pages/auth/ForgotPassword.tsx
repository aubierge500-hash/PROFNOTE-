import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import AuthLayout from './AuthLayout'

export default function ForgotPassword() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await resetPassword(email)
    setSubmitting(false)
    if (error) setError(error)
    else setSent(true)
  }

  return (
    <AuthLayout title="Mot de passe oublié" subtitle="Recevez un lien de réinitialisation par email">
      {sent ? (
        <p className="text-sm text-primary-700">
          Si un compte existe pour <strong>{email}</strong>, un email contenant un lien de réinitialisation vient
          d'être envoyé.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1">Email</label>
            <input
              type="email"
              required
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@ecole.bj"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Envoi…' : 'Envoyer le lien'}
          </button>
        </form>
      )}
      <Link to="/connexion" className="block text-sm text-primary-600 hover:underline mt-4 text-center">
        Retour à la connexion
      </Link>
    </AuthLayout>
  )
          }
