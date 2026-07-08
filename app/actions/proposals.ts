'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface ProposalItem {
  description: string
  pricing_type: string // 'fixed' | 'subscription' | 'hourly' | 'custom'
  amount: number
}

const STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired'] as const
type Result = { ok?: true; id?: string; error?: string }

export async function saveProposal(input: {
  id?: string
  company_id: string
  title: string
  items: ProposalItem[]
  terms: string
  expires_at: string | null
}): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const title = input.title.trim()
  if (!title) return { error: 'Give the proposal a title.' }
  if (!input.company_id) return { error: 'Missing client.' }

  const items = (input.items ?? [])
    .map(i => ({ description: String(i.description ?? '').trim(), pricing_type: i.pricing_type || 'custom', amount: Number(i.amount) || 0 }))
    .filter(i => i.description || i.amount)
  const total = items.reduce((sum, i) => sum + (Number.isFinite(i.amount) ? i.amount : 0), 0)
  const content = { items, terms: input.terms?.trim() || '' }

  if (input.id) {
    const { error } = await supabase
      .from('proposals')
      .update({ title, content, total_value: total, expires_at: input.expires_at || null })
      .eq('id', input.id)
    if (error) return { error: error.message }
    revalidatePath(`/proposals/${input.id}`)
    revalidatePath(`/clients/${input.company_id}`)
    return { ok: true, id: input.id }
  }

  const { data, error } = await supabase
    .from('proposals')
    .insert({
      company_id: input.company_id,
      title,
      content,
      total_value: total,
      expires_at: input.expires_at || null,
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath(`/clients/${input.company_id}`)
  return { ok: true, id: data.id }
}

export async function setProposalStatus(id: string, status: string, companyId: string): Promise<Result> {
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return { error: 'Invalid status.' }
  const supabase = await createClient()

  const patch: Record<string, unknown> = { status }
  if (status === 'sent') patch.sent_at = new Date().toISOString()
  if (status === 'accepted' || status === 'declined') patch.responded_at = new Date().toISOString()

  const { error } = await supabase.from('proposals').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/proposals/${id}`)
  revalidatePath(`/clients/${companyId}`)
  return { ok: true }
}

export async function deleteProposal(id: string, companyId: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from('proposals').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/clients/${companyId}`)
  return { ok: true }
}
