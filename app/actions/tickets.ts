'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const STATUSES = ['open', 'in_progress', 'awaiting_client', 'resolved', 'closed'] as const
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
type Result = { ok?: true; id?: string; error?: string }

// ── Team-side (authenticated) ────────────────────────────────────────────────

export async function createTicket(formData: FormData): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const company_id = String(formData.get('company_id') ?? '')
  const subject = String(formData.get('subject') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const priority = String(formData.get('priority') ?? 'medium')
  const assignee_id = String(formData.get('assignee_id') ?? '') || null
  const project_id = String(formData.get('project_id') ?? '') || null

  if (!company_id) return { error: 'Choose a client.' }
  if (!subject) return { error: 'Give the ticket a subject.' }
  if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) return { error: 'Invalid priority.' }

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({ company_id, subject, description: description || null, priority, status: 'open', assignee_id, project_id })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/tickets')
  revalidatePath(`/clients/${company_id}`)
  return { ok: true, id: data.id }
}

export async function setTicketStatus(id: string, status: string): Promise<Result> {
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return { error: 'Invalid status.' }
  const supabase = await createClient()
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  patch.resolved_at = (status === 'resolved' || status === 'closed') ? new Date().toISOString() : null
  const { error } = await supabase.from('support_tickets').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/tickets')
  revalidatePath(`/tickets/${id}`)
  return { ok: true }
}

export async function setTicketPriority(id: string, priority: string): Promise<Result> {
  if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) return { error: 'Invalid priority.' }
  const supabase = await createClient()
  const { error } = await supabase.from('support_tickets').update({ priority, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/tickets')
  revalidatePath(`/tickets/${id}`)
  return { ok: true }
}

export async function setTicketAssignee(id: string, assigneeId: string | null): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from('support_tickets').update({ assignee_id: assigneeId || null, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/tickets')
  revalidatePath(`/tickets/${id}`)
  return { ok: true }
}

export async function setTicketProject(id: string, projectId: string | null): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from('support_tickets').update({ project_id: projectId || null, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/tickets/${id}`)
  return { ok: true }
}

export async function addTicketReply(ticketId: string, content: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  const body = content.trim()
  if (!body) return { error: 'Write a reply first.' }

  const { error } = await supabase
    .from('ticket_replies')
    .insert({ ticket_id: ticketId, author_type: 'team', author_user_id: user.id, content: body })
  if (error) return { error: error.message }
  // A team reply moves an open ticket to awaiting_client; touch updated_at.
  await supabase.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId).eq('status', 'open')
  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}

export async function deleteTicket(id: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from('support_tickets').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/tickets')
  return { ok: true }
}

// ── Public (no login) — used by /support/[token] ─────────────────────────────

async function companyForToken(token: string) {
  const adminDb = await createAdminClient()
  const { data } = await adminDb.from('companies').select('id, name').eq('support_token', token).maybeSingle()
  return { adminDb, company: data }
}

export async function createTicketPublic(
  token: string,
  input: { subject: string; description: string; priority?: string; contact_id?: string | null },
): Promise<Result> {
  const { adminDb, company } = await companyForToken(token)
  if (!company) return { error: 'This support link is not valid.' }

  const subject = input.subject.trim()
  if (!subject) return { error: 'Give your request a subject.' }
  const priority = input.priority && PRIORITIES.includes(input.priority as (typeof PRIORITIES)[number]) ? input.priority : 'medium'

  const { data, error } = await adminDb
    .from('support_tickets')
    .insert({
      company_id: company.id,
      subject,
      description: input.description.trim() || null,
      priority,
      status: 'open',
      contact_id: input.contact_id || null,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath(`/support/${token}`)
  revalidatePath('/tickets')
  return { ok: true, id: data.id }
}

export async function addReplyPublic(
  token: string,
  ticketId: string,
  content: string,
  contactId?: string | null,
): Promise<Result> {
  const { adminDb, company } = await companyForToken(token)
  if (!company) return { error: 'This support link is not valid.' }
  const body = content.trim()
  if (!body) return { error: 'Write a reply first.' }

  // Ensure the ticket belongs to this company (token scoping).
  const { data: ticket } = await adminDb.from('support_tickets').select('id, company_id').eq('id', ticketId).maybeSingle()
  if (!ticket || ticket.company_id !== company.id) return { error: 'Ticket not found.' }

  const { error } = await adminDb
    .from('ticket_replies')
    .insert({ ticket_id: ticketId, author_type: 'client', author_contact_id: contactId || null, content: body })
  if (error) return { error: error.message }
  // Client reply reopens a resolved-but-not-closed ticket and flags it for the team.
  await adminDb.from('support_tickets').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', ticketId).in('status', ['awaiting_client'])
  revalidatePath(`/support/${token}`)
  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}
