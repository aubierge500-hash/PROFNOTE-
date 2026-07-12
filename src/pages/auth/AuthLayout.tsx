import type { ReactNode } from 'react'

export default function AuthLayout({
  title,
  subtitle,
  children
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-primary-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="w-9 h-9 rounded-lg bg-primary-600 text-white flex items-center justify-center font-display font-bold">
            P
          </span>
          <span className="font-display text-xl font-bold text-primary-800">PROFNOTE</span>
        </div>
        <p className="text-primary-500 text-sm">Gestion des notes pour enseignants au Bénin</p>
      </div>

      <div className="w-full max-w-sm card">
        <h1 className="text-lg font-semibold text-primary-800 mb-1">{title}</h1>
        <p className="text-sm text-primary-500 mb-5">{subtitle}</p>
        {children}
      </div>
    </div>
  )
}
