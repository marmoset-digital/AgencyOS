'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const STATUSES = ['open', 'in_progress', 'awaiting_client', 'resolved', 'closed'] as const
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
type Result = { ok?: true; id?: string; error?: string }

export async function createTicket(formData: FormData): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const company_id = String(formData.get('company_id') ?? '')
  const subject = String(formData.get('subject') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const priority = String(formData.get('priority') ?? 'medium')

  if (!company_id) return { error: 'Choose a client.' }
  if (!subject) return { error: 'Give the ticket a subject.' }
  if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) return { error: 'Invalid priority.' }

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({ company_id, subject, description: description || null, priority, status: 'open' })
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
  return { ok: true }
}

export async function setTicketPriority(id: string, priority: string): Promise<Result> {
  if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) return { error: 'Invalid priority.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('support_tickets')
    .update({ priority, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/tickets')
  return { ok: true }
}

export async function deleteTicket(id: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from('support_tickets').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/tickets')
  return { ok: true }
}
