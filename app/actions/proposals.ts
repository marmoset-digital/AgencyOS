'use server'

import { randomBytes } from 'crypto'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface ProposalItem {
  description: string
  pricing_type: string // 'fixed' | 'subscription' | 'hourly' | 'custom'
  amount: number
}

const STATUSES = ['draft', 'sent', 'accepted', 'declined', 'changes_requested', 'expired'] as const
type Result = { ok?: true; id?: string; error?: string }

// --- Team-side (authenticated) -------------------------------------------------

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
      token: randomBytes(24).toString('base64url'),
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

// Create a project from an accepted proposal (or any proposal). One project per proposal.
export async function createProjectFromProposal(proposalId: string): Promise<Result & { projectId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, company_id, title, project_id')
    .eq('id', proposalId)
    .single()
  if (!proposal) return { error: 'Proposal not found.' }
  if (proposal.project_id) return { ok: true, projectId: proposal.project_id }

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      company_id: proposal.company_id,
      name: proposal.title,
      type: 'project',
      stage: 'onboarding',
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  await supabase.from('proposals').update({ project_id: project.id }).eq('id', proposalId)
  revalidatePath(`/clients/${proposal.company_id}`)
  return { ok: true, projectId: project.id }
}

// --- Public (no login) — used by /proposal/[token] -----------------------------
// Service-role, matched strictly on the secret token.

export async function submitProposalDecision(
  token: string,
  decision: 'accepted' | 'changes_requested',
  name: string,
  comment: string,
): Promise<Result> {
  if (decision !== 'accepted' && decision !== 'changes_requested') return { error: 'Invalid decision.' }
  const cleanName = name.trim()
  if (!cleanName) return { error: 'Please enter your name.' }
  const cleanComment = comment.trim()
  if (decision === 'changes_requested' && !cleanComment) {
    return { error: 'Please tell us what you’d like changed.' }
  }

  const adminDb = await createAdminClient()
  const { data: proposal } = await adminDb
    .from('proposals')
    .select('id, status, company_id')
    .eq('token', token)
    .maybeSingle()

  if (!proposal) return { error: 'This proposal link is not valid.' }
  if (proposal.status !== 'sent') return { error: 'This proposal has already been actioned.' }

  const { error } = await adminDb
    .from('proposals')
    .update({
      status: decision,
      signed_name: cleanName,
      decision_comment: cleanComment || null,
      responded_at: new Date().toISOString(),
    })
    .eq('id', proposal.id)
    .eq('status', 'sent')
  if (error) return { error: error.message }

  revalidatePath(`/proposal/${token}`)
  if (proposal.company_id) revalidatePath(`/clients/${proposal.company_id}`)
  return { ok: true }
}
