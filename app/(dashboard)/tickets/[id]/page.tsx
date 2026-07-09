import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import TicketDetail, { type DetailTicket, type DetailReply, type DetailUser, type DetailProject } from './TicketDetail'

export const metadata = { title: 'Ticket' }

function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }
function nameOf(c: { first_name: string | null; last_name: string | null } | null) {
  return c ? [c.first_name, c.last_name].filter(Boolean).join(' ') || null : null
}

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: t } = await supabase
    .from('support_tickets')
    .select('id, subject, description, priority, status, created_at, company_id, contact_id, project_id, assignee_id, companies:company_id ( name ), contact:contact_id ( first_name, last_name ), project:project_id ( name )')
    .eq('id', id)
    .maybeSingle()
  if (!t) notFound()

  const [{ data: replies }, { data: users }, { data: projects }] = await Promise.all([
    supabase
      .from('ticket_replies')
      .select('id, content, author_type, created_at, author:author_user_id ( full_name, email ), contact:author_contact_id ( first_name, last_name )')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
    supabase.from('users').select('id, full_name, email').eq('is_active', true).order('full_name', { ascending: true }),
    supabase.from('projects').select('id, name, company_id').eq('company_id', t.company_id as string).order('name', { ascending: true }),
  ])

  const ticket: DetailTicket = {
    id: t.id as string,
    subject: t.subject as string,
    description: (t.description as string | null) ?? null,
    priority: t.priority as string,
    status: t.status as string,
    created_at: (t.created_at as string | null) ?? null,
    company_id: t.company_id as string,
    company_name: one(t.companies as { name: string | null } | { name: string | null }[] | null)?.name ?? '—',
    contact_name: nameOf(one(t.contact as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null)),
    project_id: (t.project_id as string | null) ?? null,
    assignee_id: (t.assignee_id as string | null) ?? null,
  }

  const replyRows: DetailReply[] = (replies ?? []).map((r: Record<string, unknown>) => {
    const a = one(r.author as { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null)
    const c = one(r.contact as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null)
    return {
      id: r.id as string,
      content: r.content as string,
      author_type: r.author_type as string,
      created_at: (r.created_at as string | null) ?? null,
      author_name: r.author_type === 'team' ? (a?.full_name || a?.email || 'Team') : (nameOf(c) || 'Client'),
    }
  })

  return (
    <TicketDetail
      ticket={ticket}
      replies={replyRows}
      users={(users ?? []) as DetailUser[]}
      projects={(projects ?? []) as DetailProject[]}
    />
  )
}
