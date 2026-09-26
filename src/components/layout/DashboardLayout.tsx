import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  School,
  Users,
  ClipboardList,
  UserCircle,
  LogOut,
  ScanLine,
  MessageCircle,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

const navItems = [
  {
    to: '/',
    label: 'Tableau de bord',
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: '/classes',
    label: 'Classes',
    icon: School,
  },
  {
    to: '/eleves',
    label: 'Élèves',
    icon: Users,
  },
  {
    to: '/evaluations',
    label: 'Évaluations',
    icon: ClipboardList,
  },
  {
    to: '/whatsapp-historique',
    label: 'WhatsApp',
    icon: MessageCircle,
  },
]

export default function DashboardLayout() {
  const { signOut, user } = useAuth()

  return (
    <div className="min-h-screen bg-primary-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-primary-800 text-white flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-primary-700">
          <h1 className="text-xl font-display font-bold">PROFNOTE</h1>
          <p className="text-xs text-primary-300 mt-1">
            Gestion des notes
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'text-primary-200 hover:bg-primary-700'
                  }`
                }
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            )
          })}

          {/* Scanner */}
          <NavLink
            to="/scanner"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-primary-200 hover:bg-primary-700'
              }`
            }
          >
            <ScanLine size={18} />
            Scanner
          </NavLink>
        </nav>

        {/* Profil + déconnexion */}
        <div className="p-3 border-t border-primary-700">
          <NavLink
            to="/profil"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-primary-200 hover:bg-primary-700'
              }`
            }
          >
            <UserCircle size={18} />
            Profil
          </NavLink>

          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 mt-1 rounded-lg text-sm font-medium text-primary-200 hover:bg-primary-700 transition-colors"
          >
            <LogOut size={18} />
            Déconnexion
          </button>

          {user?.email && (
            <p className="text-xs text-primary-400 mt-3 px-3 truncate">
              {user.email}
            </p>
          )}
        </div>
      </aside>

      {/* Contenu principal */}
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  )
}