'use server'

import { createAdminClient } from '@/lib/supabase/server'

// Public, no-login support actions for the email-gated /support page.
// Identity is the client's email, re-verified against active-client contacts on EVERY call —
// the browser is never trusted with a company/contact id. This is deliberately lightweight
// (email possession, not a password); when Emailit is live we can add a magic-link confirm.

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const

export interface SupportReply { id: string; content: string; author_type: string; author_label: string; created_at: string | null }
export interface SupportTicketView {
  id: string; subject: string; description: string | null; priority: string; status: string; created_at: string | null; replies: SupportReply[]
}
export interface SupportSession { ok: true; name: string; company: string; tickets: SupportTicketView[] }
type Fail = { error: string }

function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }
function escapeLike(s: string) { return s.replace(/([%_\\])/g, '\\$1') }

interface MatchedContact { id: string; name: string; company_id: string; company_name: string }

// Return the active-client contact whose email matches (case-insensitive), or null.
async function activeContactByEmail(rawEmail: string): Promise<MatchedContact | null> {
  const email = rawEmail.trim()
  if (!email || !email.includes('@')) return null
  const adminDb = await createAdminClient()
  const { data } = await adminDb
    .from('contacts')
    .select('id, first_name, last_name, company_id, companies:company_id ( name, status )')
    .ilike('email', escapeLike(email))

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const co = one(row.companies as { name: string | null; status: string | null } | { name: string | null; status: string | null }[] | null)
    if (co?.status === 'active_client') {
      const name = [row.first_name as string | null, row.last_name as string | null].filter(Boolean).join(' ') || 'there'
      return { id: row.id as string, name, company_id: row.company_id as string, company_name: co.name ?? '' }
    }
  }
  return null
}

async function loadSession(contact: MatchedContact): Promise<SupportSession> {
  const adminDb = await createAdminClient()
  const { data: tickets } = await adminDb
    .from('support_tickets')
    .select('id, subject, description, priority, status, created_at')
    .eq('company_id', contact.company_id)
    .eq('contact_id', contact.id)
    .order('created_at', { ascending: false })

  const ids = (tickets ?? []).map((t: Record<string, unknown>) => t.id as string)
  const { data: replies } = ids.length
    ? await adminDb.from('ticket_replies')
        .select('id, ticket_id, content, author_type, created_at')
        .in('ticket_id', ids)
        .order('created_at', { ascending: true })
    : { data: [] as Record<string, unknown>[] }

  const byTicket = new Map<string, SupportReply[]>()
  for (const r of (replies ?? []) as Record<string, unknown>[]) {
    const arr = byTicket.get(r.ticket_id as string) ?? []
    arr.push({
      id: r.id as string,
      content: r.content as string,
      author_type: r.author_type as string,
      author_label: r.author_type === 'team' ? 'Marmoset' : 'You',
      created_at: (r.created_at as string | null) ?? null,
    })
    byTicket.set(r.ticket_id as string, arr)
  }

  const views: SupportTicketView[] = (tickets ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    subject: t.subject as string,
    description: (t.description as string | null) ?? null,
    priority: t.priority as string,
    status: t.status as string,
    created_at: (t.created_at as string | null) ?? null,
    replies: byTicket.get(t.id as string) ?? [],
  }))

  return { ok: true, name: contact.name, company: contact.company_name, tickets: views }
}

// Step 1 — verify email + return their existing requests.
export async function enterSupport(email: string): Promise<SupportSession | Fail> {
  const contact = await activeContactByEmail(email)
  if (!contact) return { error: 'We couldn’t find that email against a current client. Please check it, or contact Marmoset directly.' }
  return loadSession(contact)
}

// Raise a new ticket.
export async function createSupportTicket(
  email: string,
  input: { subject: string; description: string; priority?: string },
): Promise<SupportSession | Fail> {
  const contact = await activeContactByEmail(email)
  if (!contact) return { error: 'Your session has expired — please enter your email again.' }
  const subject = input.subject.trim()
  if (!subject) return { error: 'Please add a subject.' }
  const priority = input.priority && (PRIORITIES as readonly string[]).includes(input.priority) ? input.priority : 'medium'

  const adminDb = await createAdminClient()
  const { error } = await adminDb.from('support_tickets').insert({
    company_id: contact.company_id,
    contact_id: contact.id,
    subject,
    description: input.description.trim() || null,
    priority,
    status: 'open',
  })
  if (error) return { error: error.message }
  return loadSession(contact)
}

// Reply to one of their own tickets.
export async function addSupportReply(email: string, ticketId: string, content: string): Promise<SupportSession | Fail> {
  const contact = await activeContactByEmail(email)
  if (!contact) return { error: 'Your session has expired — please enter your email again.' }
  const body = content.trim()
  if (!body) return { error: 'Write a reply first.' }

  const adminDb = await createAdminClient()
  const { data: ticket } = await adminDb.from('support_tickets').select('id, contact_id').eq('id', ticketId).maybeSingle()
  if (!ticket || ticket.contact_id !== contact.id) return { error: 'Request not found.' }

  const { error } = await adminDb.from('ticket_replies').insert({
    ticket_id: ticketId, author_type: 'client', author_contact_id: contact.id, content: body,
  })
  if (error) return { error: error.message }
  await adminDb.from('support_tickets').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', ticketId).in('status', ['awaiting_client'])
  return loadSession(contact)
}
