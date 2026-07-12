import { useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { supabase } from '@/lib/supabase'

export default function Profile() {
  const { profile, user } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [schoolName, setSchoolName] = useState(profile?.school_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (!user) return
    await supabase.from('profiles').update({ full_name: fullName, school_name: schoolName, phone }).eq('id', user.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4 max-w-md">
      <h1 className="text-xl font-semibold text-primary-800">Mon profil</h1>
      <div className="card space-y-3">
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1">Nom complet</label>
          <input className="input-field" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1">Établissement</label>
          <input className="input-field" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1">Téléphone</label>
          <input className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1">Email</label>
          <input className="input-field bg-primary-50" value={user?.email ?? ''} disabled />
        </div>
        <button onClick={handleSave} className="btn-primary text-sm">Enregistrer</button>
        {saved && <p className="text-sm text-success">Profil mis à jour ✓</p>}
      </div>
    </div>
  )
}
