import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/lib/AuthContext'
import OfflineBanner from '@/components/OfflineBanner'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OfflineBanner />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)
