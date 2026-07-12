import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import AuthLayout from './AuthLayout'

export default function Login() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) setError(error)
    else navigate('/')
  }

  return (
    <AuthLayout title="Connexion" subtitle="Accédez à votre espace enseignant">
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
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1">Mot de passe</label>
          <input
            type="password"
            required
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>

        <div className="flex items-center justify-between text-sm pt-1">
          <Link to="/mot-de-passe-oublie" className="text-primary-600 hover:underline">
            Mot de passe oublié ?
          </Link>
          <Link to="/inscription" className="text-primary-600 hover:underline">
            Créer un compte
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
