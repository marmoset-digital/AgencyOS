import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TicketsManager, { type TicketRow, type TicketCompany } from './TicketsManager'

export const metadata = { title: 'Support Tickets' }

function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }

export default async function TicketsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: tickets }, { data: companies }] = await Promise.all([
    supabase
      .from('support_tickets')
      .select('id, subject, description, priority, status, created_at, company_id, companies:company_id ( name )')
      .order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name').order('name', { ascending: true }),
  ])

  const rows: TicketRow[] = (tickets ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    subject: t.subject as string,
    description: (t.description as string | null) ?? null,
    priority: t.priority as string,
    status: t.status as string,
    created_at: (t.created_at as string | null) ?? null,
    company_id: t.company_id as string,
    company_name: one(t.companies as { name: string | null } | { name: string | null }[] | null)?.name ?? '—',
  }))

  return <TicketsManager tickets={rows} companies={(companies ?? []) as TicketCompany[]} />
}
