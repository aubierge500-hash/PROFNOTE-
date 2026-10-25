import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { clearOfflineCache } from './offlineCache'
import { clearAccessSnapshot, readStoredSession } from './offlineAccess'
import { flushOutbox, getPendingCount } from './offlineOutbox'
import { resetSyncUser } from './offlineSync'
import type { Profile } from '@/types/database'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    fullName: string,
    referralCode?: string
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const MESSAGE_HORS_LIGNE =
  'Pas de connexion internet. La connexion, l’inscription et la réinitialisation du mot de passe nécessitent internet.'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
      if (error) {
        console.error('[Auth] Erreur de chargement du profil :', error.message)
        return
      }
      setProfile(data as Profile | null)
    } catch (err) {
      console.error('[Auth] Exception lors du chargement du profil :', err)
    }
  }

  useEffect(() => {
    let resolved = false

    const safetyTimeout = setTimeout(() => {
      if (resolved) return
      resolved = true

      // Réseau absent ou très lent : on reprend la session enregistrée sur l'appareil
      // plutôt que de renvoyer l'enseignant vers l'écran de connexion.
      const stored = readStoredSession()
      if (stored) {
        console.warn('[Auth] Délai dépassé — reprise de la session enregistrée sur cet appareil.')
        setSession(stored)
        void loadProfile(stored.user.id)
      } else {
        console.warn('[Auth] Délai dépassé en attendant Supabase — affichage de la connexion par défaut.')
      }
      setLoading(false)
    }, 8000)

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (resolved) return
        resolved = true
        clearTimeout(safetyTimeout)
        setSession(data.session)
        if (data.session?.user) void loadProfile(data.session.user.id)
        setLoading(false)
      })
      .catch((err) => {
        console.error('[Auth] Erreur lors de la vérification de session :', err)
        if (!resolved) {
          resolved = true
          clearTimeout(safetyTimeout)
          const stored = readStoredSession()
          if (stored) {
            setSession(stored)
            void loadProfile(stored.user.id)
          }
          setLoading(false)
        }
      })

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Sans réseau, Supabase peut signaler « aucune session » alors que la session existe
      // bel et bien sur l'appareil : on ne déconnecte que sur une vraie déconnexion.
      if (!newSession && event !== 'SIGNED_OUT' && readStoredSession()) return

      setSession(newSession)
      if (newSession?.user) {
        void loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => {
      clearTimeout(safetyTimeout)
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    if (!navigator.onLine) return { error: MESSAGE_HORS_LIGNE }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? traduireErreur(error.message) : null }
  }

  async function signUp(email: string, password: string, fullName: string, referralCode?: string) {
    if (!navigator.onLine) return { error: MESSAGE_HORS_LIGNE }
    const code = referralCode?.trim()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: code ? { full_name: fullName, referral_code: code } : { full_name: fullName } }
    })
    return { error: error ? traduireErreur(error.message) : null }
  }

  async function signOut() {
    // Des modifications faites sans internet attendent encore : on tente de les envoyer d'abord.
    if (getPendingCount() > 0 && navigator.onLine) {
      await flushOutbox({ maxMs: 10_000 }).catch(() => undefined)
    }

    if (
      getPendingCount() > 0 &&
      !window.confirm(
        'Des modifications faites sans internet ne sont pas encore envoyées. ' +
          'Elles restent sur cet appareil et partiront à votre prochaine connexion avec ce compte. ' +
          'Se déconnecter quand même ?'
      )
    ) {
      return
    }

    try {
      // Hors ligne, la déconnexion « globale » échoue : on se déconnecte seulement de cet appareil.
      await supabase.auth.signOut({ scope: navigator.onLine ? 'global' : 'local' })
    } catch (err) {
      console.warn('[Auth] Déconnexion auprès du serveur impossible :', err)
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        // Rien de plus à faire : l'état local est réinitialisé ci-dessous.
      }
    }

    // Les données copiées sur l'appareil appartiennent à l'enseignant qui part
    // (les modifications non envoyées, elles, sont conservées pour lui).
    clearAccessSnapshot()
    resetSyncUser()
    await clearOfflineCache()
    setSession(null)
    setProfile(null)
  }

  async function resetPassword(email: string) {
    if (!navigator.onLine) return { error: MESSAGE_HORS_LIGNE }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`
    })
    return { error: error ? traduireErreur(error.message) : null }
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, loading, signIn, signUp, signOut, resetPassword }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé à l’intérieur de <AuthProvider>')
  return ctx
}

function traduireErreur(message: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'Email ou mot de passe incorrect.',
    'User already registered': 'Un compte existe déjà avec cet email.',
    'Email not confirmed': 'Veuillez confirmer votre email avant de vous connecter.',
    'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.'
  }
  return map[message] ?? message
}
