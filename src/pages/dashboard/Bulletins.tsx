import { supabase } from '@/lib/supabase'
import BulletinPage from '@/features/bulletin/BulletinPage'
import type { SupabaseLike } from '@/features/bulletin/bulletin.data'

export default function Bulletins() {
  return <BulletinPage supabase={supabase as unknown as SupabaseLike} />
}
