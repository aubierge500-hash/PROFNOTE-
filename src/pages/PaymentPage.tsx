import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import PaymentInstructions from '@/components/PaymentInstructions'

/** Page de paiement ouverte depuis le bandeau d'essai ; accessible aussi quand l'accès est bloqué. */
export default function PaymentPage() {
  const { user } = useAuth()

  if (!user) return <Navigate to="/connexion" replace />

  return (
    <main className="min-h-screen bg-primary-50 flex items-center justify-center p-4">
      <section className="bg-white w-full max-w-lg rounded-2xl border border-primary-100 shadow-sm p-6 md:p-8">
        <p className="text-sm font-semibold text-primary-500">PROFNOTE</p>
        <h1 className="text-2xl font-bold text-primary-800 mt-3">Payer mon abonnement</h1>
        <p className="text-sm text-primary-500 mt-2 mb-5">Trois étapes simples, depuis votre téléphone.</p>

        <PaymentInstructions />

        <Link to="/" className="mt-5 block text-center text-sm text-primary-600 hover:underline">
          Retour à l’application
        </Link>
      </section>
    </main>
  )
}
