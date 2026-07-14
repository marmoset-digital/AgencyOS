import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

// Dashboard "Recent client activity" panel. Surfaces client-initiated events the team would
// otherwise miss: proposal decisions, new tickets + client replies, approval decisions, and new
// projects created from proposals. Read-only, server-rendered. Uses flat queries + id→name maps
// (no nested embeds) so the build stays robust.

type Kind = 'proposal' | 'ticket' | 'reply' | 'approval' | 'project'
interface Activity {
  key: string
  kind: Kind
  at: number            // epoch ms for sorting
  when: string | null   // ISO for display
  icon: string
  text: string          // main line
  who: string | null    // signer / actor
  company: string
  href: string
}

function rel(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 8) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-AU')
}
function money(n: number | null): string {
  const v = Number(n) || 0
  return `$${v.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default async function ClientActivity() {
  const supabase = await createClient()

  const [proposals, tickets, replies, approvals, linkedProps] = await Promise.all([
    supabase.from('proposals')
      .select('id, title, status, total_value, signed_name, responded_at, company_id')
      .in('status', ['accepted', 'changes_requested']).not('responded_at', 'is', null)
      .order('responded_at', { ascending: false }).limit(10),
    supabase.from('support_tickets')
      .select('id, subject, created_at, company_id')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('ticket_replies')
      .select('id, ticket_id, created_at')
      .eq('author_type', 'client').order('created_at', { ascending: false }).limit(10),
    supabase.from('approvals')
      .select('id, title, status, signed_name, decided_at, company_id, project_id')
      .in('status', ['approved', 'changes_requested']).not('decided_at', 'is', null)
      .order('decided_at', { ascending: false }).limit(10),
    supabase.from('proposals').select('project_id').not('project_id', 'is', null),
  ])

  // Projects that were created from a proposal (recent first).
  const projectIds = [...new Set((linkedProps.data ?? []).map((r: Record<string, unknown>) => r.project_id as string))]
  const { data: projects } = projectIds.length
    ? await supabase.from('projects').select('id, name, created_at, company_id')
        .in('id', projectIds).order('created_at', { ascending: false }).limit(10)
    : { data: [] as Record<string, unknown>[] }

  // Resolve company + ticket-subject names via id→name maps (no embeds).
  const companyIds = new Set<string>()
  for (const r of (proposals.data ?? []) as Record<string, unknown>[]) if (r.company_id) companyIds.add(r.company_id as string)
  for (const r of (tickets.data ?? []) as Record<string, unknown>[]) if (r.company_id) companyIds.add(r.company_id as string)
  for (const r of (approvals.data ?? []) as Record<string, unknown>[]) if (r.company_id) companyIds.add(r.company_id as string)
  for (const r of (projects ?? []) as Record<string, unknown>[]) if (r.company_id) companyIds.add(r.company_id as string)

  const replyTicketIds = [...new Set((replies.data ?? []).map((r: Record<string, unknown>) => r.ticket_id as string))]
  const { data: replyTickets } = replyTicketIds.length
    ? await supabase.from('support_tickets').select('id, subject, company_id').in('id', replyTicketIds)
    : { data: [] as Record<string, unknown>[] }
  for (const r of (replyTickets ?? []) as Record<string, unknown>[]) if (r.company_id) companyIds.add(r.company_id as string)

  const { data: companies } = companyIds.size
    ? await supabase.from('companies').select('id, name').in('id', [...companyIds])
    : { data: [] as Record<string, unknown>[] }
  const companyName = new Map<string, string>()
  for (const c of (companies ?? []) as Record<string, unknown>[]) companyName.set(c.id as string, (c.name as string) ?? '—')
  const ticketById = new Map<string, { subject: string; company_id: string }>()
  for (const t of (replyTickets ?? []) as Record<string, unknown>[]) ticketById.set(t.id as string, { subject: t.subject as string, company_id: t.company_id as string })

  const items: Activity[] = []

  for (const p of (proposals.data ?? []) as Record<string, unknown>[]) {
    const accepted = p.status === 'accepted'
    items.push({
      key: `prop-${p.id}`, kind: 'proposal', at: new Date(p.responded_at as string).getTime(), when: p.responded_at as string,
      icon: accepted ? '✅' : '✏️',
      text: `${accepted ? 'Accepted' : 'Requested changes to'} “${p.title as string}”${p.total_value ? ` · ${money(p.total_value as number)}` : ''}`,
      who: (p.signed_name as string | null) ?? null,
      company: companyName.get(p.company_id as string) ?? '—',
      href: `/clients/${p.company_id}`,
    })
  }
  for (const t of (tickets.data ?? []) as Record<string, unknown>[]) {
    items.push({
      key: `tkt-${t.id}`, kind: 'ticket', at: new Date(t.created_at as string).getTime(), when: t.created_at as string,
      icon: '🎫', text: `New support ticket: “${t.subject as string}”`, who: null,
      company: companyName.get(t.company_id as string) ?? '—', href: `/tickets/${t.id}`,
    })
  }
  for (const r of (replies.data ?? []) as Record<string, unknown>[]) {
    const t = ticketById.get(r.ticket_id as string)
    items.push({
      key: `rep-${r.id}`, kind: 'reply', at: new Date(r.created_at as string).getTime(), when: r.created_at as string,
      icon: '💬', text: `Client replied on “${t?.subject ?? 'a ticket'}”`, who: null,
      company: t ? (companyName.get(t.company_id) ?? '—') : '—', href: `/tickets/${r.ticket_id}`,
    })
  }
  for (const a of (approvals.data ?? []) as Record<string, unknown>[]) {
    const approved = a.status === 'approved'
    items.push({
      key: `apr-${a.id}`, kind: 'approval', at: new Date(a.decided_at as string).getTime(), when: a.decided_at as string,
      icon: approved ? '👍' : '🔁',
      text: `${approved ? 'Approved' : 'Requested changes to'} “${a.title as string}”`,
      who: (a.signed_name as string | null) ?? null,
      company: companyName.get(a.company_id as string) ?? '—',
      href: a.project_id ? `/projects/${a.project_id}` : '/approvals',
    })
  }
  for (const pr of (projects ?? []) as Record<string, unknown>[]) {
    items.push({
      key: `prj-${pr.id}`, kind: 'project', at: new Date(pr.created_at as string).getTime(), when: pr.created_at as string,
      icon: '📁', text: `Project started: “${pr.name as string}”`, who: null,
      company: companyName.get(pr.company_id as string) ?? '—', href: `/projects/${pr.id}`,
    })
  }

  items.sort((a, b) => b.at - a.at)
  const top = items.slice(0, 12)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Recent client activity</h2>
        <span className="text-xs text-gray-400">Proposals · tickets · approvals · projects</span>
      </div>
      {top.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">No recent client activity yet — accepted proposals, new tickets and approvals will show here.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {top.map(a => (
            <Link key={a.key} href={a.href} className="flex items-start gap-3 py-2.5 group">
              <span className="text-base leading-5 mt-0.5" aria-hidden>{a.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800 group-hover:text-[#254DA5] truncate">{a.text}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {a.company}{a.who ? ` · ${a.who}` : ''}{a.when ? ` · ${rel(a.when)}` : ''}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
