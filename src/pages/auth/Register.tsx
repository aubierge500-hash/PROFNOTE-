import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import AuthLayout from './AuthLayout'

export default function Register() {
  const { session, signUp } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signUp(email, password, fullName)
    setSubmitting(false)
    if (error) setError(error)
    else setDone(true)
  }

  if (done) {
    return (
      <AuthLayout title="Vérifiez votre email" subtitle="Dernière étape avant de commencer">
        <p className="text-sm text-primary-700">
          Un email de confirmation a été envoyé à <strong>{email}</strong>. Cliquez sur le lien reçu pour activer
          votre compte, puis connectez-vous.
        </p>
        <Link to="/connexion" className="btn-primary w-full mt-5 inline-block text-center">
          Retour à la connexion
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Créer un compte" subtitle="Commencez à gérer vos classes en quelques minutes">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1">Nom complet</label>
          <input
            required
            className="input-field"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ex: Thècle AHOTON"
          />
        </div>
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
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1">Mot de passe</label>
          <input
            type="password"
            required
            minLength={6}
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Au moins 6 caractères"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? 'Création…' : 'Créer mon compte'}
        </button>

        <p className="text-sm text-center text-primary-500">
          Déjà inscrit ?{' '}
          <Link to="/connexion" className="text-primary-600 hover:underline">
            Se connecter
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
