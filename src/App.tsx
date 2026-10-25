
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import ProtectedRoute from '@/routes/ProtectedRoute'

import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import ResetPassword from '@/pages/auth/ResetPassword'

import SubscriptionPage from '@/pages/SubscriptionPage'
import PaymentPage from '@/pages/PaymentPage'
import AdminSubscriptions from '@/pages/admin/AdminSubscriptions'
import AdminReferrals from '@/pages/admin/AdminReferrals'
import Referral from '@/pages/dashboard/Referral'

import DashboardLayout from '@/components/layout/DashboardLayout'
import Dashboard from '@/pages/dashboard/Dashboard'
import Classes from '@/pages/dashboard/Classes'
import ClassDetail from '@/pages/dashboard/ClassDetail'
import Students from '@/pages/dashboard/Students'
import StudentDetail from '@/pages/dashboard/StudentDetail'
import Evaluations from '@/pages/dashboard/Evaluations'
import Profile from '@/pages/dashboard/Profile'
import WhatsApp from '@/pages/dashboard/WhatsApp'
import WhatsAppHistory from '@/pages/dashboard/WhatsAppHistory'
import Bulletins from '@/pages/dashboard/Bulletins'
import Guide from '@/pages/dashboard/Guide'

export default function App() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-primary-600">
        Chargement…
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/connexion" element={<Login />} />
      <Route path="/inscription" element={<Register />} />

      <Route
        path="/mot-de-passe-oublie"
        element={<ForgotPassword />}
      />

      <Route
        path="/reinitialiser-mot-de-passe"
        element={<ResetPassword />}
      />

      <Route
        path="/abonnement"
        element={<SubscriptionPage />}
      />

      <Route
        path="/paiement"
        element={<PaymentPage />}
      />

      <Route element={<ProtectedRoute />}>
        <Route
          path="/admin-abonnements"
          element={<AdminSubscriptions />}
        />

        <Route
          path="/admin-parrainages"
          element={<AdminReferrals />}
        />

        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/parrainage" element={<Referral />} />

          <Route path="/classes" element={<Classes />} />
          <Route
            path="/classes/:classId"
            element={<ClassDetail />}
          />

          <Route path="/eleves" element={<Students />} />
          <Route
            path="/eleves/:studentId"
            element={<StudentDetail />}
          />

          <Route
            path="/evaluations"
            element={<Evaluations />}
          />

          <Route path="/whatsapp" element={<WhatsApp />} />

          <Route
            path="/whatsapp-historique"
            element={<WhatsAppHistory />}
          />

          <Route path="/profil" element={<Profile />} />
          <Route path="/bulletins" element={<Bulletins />} />
          <Route path="/guide" element={<Guide />} />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  )
} 
