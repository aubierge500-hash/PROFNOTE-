import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'

export default function ProtectedRoute() {
  const { session } = useAuth()
  if (!session) return <Navigate to="/connexion" replace />
  return <Outlet />
}
