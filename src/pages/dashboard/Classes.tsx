import { useEffect, useState } from 'react'
import { Plus, Archive, Trash2, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import type { SchoolClass } from '@/types/database'

export default function Classes() {
  const { user } = useAuth()
  const [classes, setClasses] = useState<SchoolClass[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SchoolClass | null>(null)
  const [name, setName] = useState('')
  const [level, setLevel] = useState('')

  useEffect(() => {
    if (user) void loadClasses()
  }, [user])

  async function loadClasses() {
    setLoading(true)
    const { data } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', user!.i
