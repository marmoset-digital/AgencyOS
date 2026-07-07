import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TeamManager from './TeamManager'

export const metadata = { title: 'Team' }

export interface TeamUser {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  is_active: boolean
  created_at: string | null
}

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') redirect('/dashboard')

  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email, role, is_active, created_at')
    .order('is_active', { ascending: false })
    .order('full_name', { ascending: true })

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <p className="text-gray-500 mt-1">Invite teammates, set their role, and manage access.</p>
      </div>

      <TeamManager users={(users ?? []) as TeamUser[]} currentUserId={user.id} />
    </div>
  )
}
