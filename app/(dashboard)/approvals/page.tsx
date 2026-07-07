import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ApprovalsManager from './ApprovalsManager'

export const metadata = { title: 'Approvals' }

export interface ApprovalRow {
  id: string
  token: string
  title: string
  status: string
  link_url: string | null
  signed_name: string | null
  decision_comment: string | null
  decided_at: string | null
  created_at: string | null
  project_id: string | null
}

export interface ProjectOption { id: string; name: string }

export default async function ApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: approvals }, { data: projects }] = await Promise.all([
    supabase
      .from('approvals')
      .select('id, token, title, status, link_url, signed_name, decision_comment, decided_at, created_at, project_id')
      .order('created_at', { ascending: false }),
    supabase.from('projects').select('id, name').order('name', { ascending: true }),
  ])

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
        <p className="text-gray-500 mt-1">Send a client a link to sign off on a proposal or deliverable — no login needed.</p>
      </div>

      <ApprovalsManager
        approvals={(approvals ?? []) as ApprovalRow[]}
        projects={(projects ?? []) as ProjectOption[]}
      />
    </div>
  )
}
