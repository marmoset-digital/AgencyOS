import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ApprovalsRollup from './ApprovalsManager'

export const metadata = { title: 'Approvals' }

export interface RollupRow {
  id: string
  token: string
  title: string
  status: string
  signed_name: string | null
  decision_comment: string | null
  decided_at: string | null
  created_at: string | null
  projectId: string | null
  projectName: string | null
  taskTitle: string | null
  contactName: string | null
}

export default async function ApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: approvalRows } = await supabase
    .from('approvals')
    .select(`
      id, token, title, status, project_id, signed_name, decision_comment, decided_at, created_at,
      project:project_id ( name ),
      task:task_id ( title ),
      contact:contact_id ( first_name, last_name )
    `)
    .order('created_at', { ascending: false })

  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

  const rows: RollupRow[] = (approvalRows ?? []).map(r => {
    const proj = one(r.project as { name: string | null } | { name: string | null }[] | null)
    const task = one(r.task as { title: string | null } | { title: string | null }[] | null)
    const contact = one(r.contact as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null)
    return {
      id: r.id,
      token: r.token,
      title: r.title,
      status: r.status,
      signed_name: r.signed_name,
      decision_comment: r.decision_comment,
      decided_at: r.decided_at,
      created_at: r.created_at,
      projectId: r.project_id,
      projectName: proj?.name ?? null,
      taskTitle: task?.title ?? null,
      contactName: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null : null,
    }
  })

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
        <p className="text-gray-500 mt-1">Everything awaiting client sign-off across all projects. Create requests from a task or a project.</p>
      </div>

      <ApprovalsRollup rows={rows} />
    </div>
  )
}
