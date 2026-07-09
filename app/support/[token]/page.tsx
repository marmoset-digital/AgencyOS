import { createAdminClient } from '@/lib/supabase/server'
import SupportPortal, { type PortalTicket, type PortalReply, type PortalContact } from './SupportPortal'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Support — Marmoset' }

function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }
function nameOf(c: { first_name: string | null; last_name: string | null } | null) {
  return c ? [c.first_name, c.last_name].filter(Boolean).join(' ') || null : null
}

export default async function SupportPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const adminDb = await createAdminClient()

  const { data: company } = await adminDb
    .from('companies')
    .select('id, name')
    .eq('support_token', token)
    .maybeSingle()

  if (!company) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-6"><div className="text-[#254DA5] font-bold text-xs tracking-widest uppercase">Marmoset Digital</div></div>
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <h1 className="text-lg font-semibold text-gray-900 mb-1">Link not valid</h1>
            <p className="text-sm text-gray-500">This support link is invalid or has been removed. Please contact Marmoset for a new one.</p>
          </div>
        </div>
      </div>
    )
  }

  const { data: tickets } = await adminDb
    .from('support_tickets')
    .select('id, subject, description, priority, status, created_at')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })

  const ids = (tickets ?? []).map((t: Record<string, unknown>) => t.id as string)
  const { data: replies } = ids.length
    ? await adminDb
        .from('ticket_replies')
        .select('id, ticket_id, content, author_type, created_at, contact:author_contact_id ( first_name, last_name )')
        .in('ticket_id', ids)
        .order('created_at', { ascending: true })
    : { data: [] as Record<string, unknown>[] }

  const { data: contacts } = await adminDb
    .from('contacts')
    .select('id, first_name, last_name')
    .eq('company_id', company.id)
    .order('is_primary', { ascending: false })

  const repliesByTicket = new Map<string, PortalReply[]>()
  for (const r of (replies ?? []) as Record<string, unknown>[]) {
    const arr = repliesByTicket.get(r.ticket_id as string) ?? []
    arr.push({
      id: r.id as string,
      content: r.content as string,
      author_type: r.author_type as string,
      created_at: (r.created_at as string | null) ?? null,
      author_label: r.author_type === 'team' ? 'Marmoset' : (nameOf(one(r.contact as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null)) || 'You'),
    })
    repliesByTicket.set(r.ticket_id as string, arr)
  }

  const portalTickets: PortalTicket[] = (tickets ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    subject: t.subject as string,
    description: (t.description as string | null) ?? null,
    priority: t.priority as string,
    status: t.status as string,
    created_at: (t.created_at as string | null) ?? null,
    replies: repliesByTicket.get(t.id as string) ?? [],
  }))

  return (
    <SupportPortal
      token={token}
      companyName={company.name}
      tickets={portalTickets}
      contacts={(contacts ?? []) as PortalContact[]}
    />
  )
}
