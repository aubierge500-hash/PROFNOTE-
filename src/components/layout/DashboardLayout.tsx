import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, School, Users, ClipboardList, UserCircle, LogOut, ScanLine } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

const navItems = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/classes', label: 'Classes', icon: School },
  { to: '/eleves', label: 'Élèves', icon: Users },
  { to: '/evaluations', label: 'Évaluations', icon: ClipboardList },
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
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
