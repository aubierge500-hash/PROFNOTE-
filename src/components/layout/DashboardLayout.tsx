import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, School, Users, ClipboardList, UserCircle, LogOut, ScanLine, MessageCircle } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

const navItems = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/classes', label: 'Classes', icon: School },
  { to: '/eleves', label: 'Élèves', icon: Users },
  { to: '/evaluations', label: 'Évaluations', icon: ClipboardList },
  { to: '/whatsapp-historique', label: 'WhatsApp', icon: MessageCircle },
]

export default function DashboardLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-primary-50 flex flex-col md:flex-row">
      <aside className="hidden md:flex md:w-64 md:flex-col bg-primary-800 text-white">
        <div className="px-5 py-5 flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-accent text-primary-900 flex items-center justify-center font-display font-bold text-sm">
            P
          </span>
          <span className="font-display font-bold text-lg">PROFNOTE</span>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-primary-600 text-white' : 'text-primary-200 hover:bg-primary-700'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}

          <button
            disabled
            title="Bientôt disponible"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary-400 cursor-not-allowed"
          >
            <ScanLine size={18} />
            Scanner
          </button>
        </nav>

        <div className="px-3 pb-4 space-y-1 border-t border-primary-700 pt-3">
          <NavLink
            to="/profil"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                isActive ? 'bg-primary-600' : 'text-primary-200 hover:bg-primary-700'
              }`
            }
          >
            <UserCircle size={18} />
            {profile?.full_name ?? 'Mon profil'}
          </NavLink>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary-200 hover:bg-primary-700"
          >
            <LogOut size={18} />
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 pb-20 md:pb-0">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-primary-100 flex justify-around py-2 z-10">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 text-xs ${
                isActive ? 'text-primary-600' : 'text-primary-400'
              }`
            }
          >
            <Icon size={20} />
            {label.split(' ')[0]}
          </NavLink>
        ))}
      </nav>
    </div>
  )
      }
