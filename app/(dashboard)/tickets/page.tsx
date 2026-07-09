import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TicketsManager, { type TicketRow, type TicketCompany, type TicketUser, type TicketProject } from './TicketsManager'

export const metadata = { title: 'Support Tickets' }

function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }

export default async function TicketsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: tickets }, { data: companies }, { data: users }, { data: projects }] = await Promise.all([
    supabase
      .from('support_tickets')
      .select('id, subject, priority, status, created_at, company_id, assignee_id, companies:company_id ( name ), assignee:assignee_id ( full_name, email )')
      .order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name, support_token').order('name', { ascending: true }),
    supabase.from('users').select('id, full_name, email').eq('is_active', true).order('full_name', { ascending: true }),
    supabase.from('projects').select('id, name, company_id').order('name', { ascending: true }),
  ])

  const rows: TicketRow[] = (tickets ?? []).map((t: Record<string, unknown>) => {
    const a = one(t.assignee as { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null)
    return {
      id: t.id as string,
      subject: t.subject as string,
      priority: t.priority as string,
      status: t.status as string,
      created_at: (t.created_at as string | null) ?? null,
      company_id: t.company_id as string,
      company_name: one(t.companies as { name: string | null } | { name: string | null }[] | null)?.name ?? '—',
      assignee_id: (t.assignee_id as string | null) ?? null,
      assignee_name: a ? (a.full_name || a.email || 'Team') : null,
    }
  })

  return (
    <TicketsManager
      tickets={rows}
      companies={(companies ?? []) as TicketCompany[]}
      users={(users ?? []) as TicketUser[]}
      projects={(projects ?? []) as TicketProject[]}
    />
  )
}
