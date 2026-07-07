'use server'

import { randomBytes } from 'crypto'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type Result = { ok?: true; error?: string; token?: string }

function normaliseUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

// --- Team-side (authenticated) -------------------------------------------------

export async function createApproval(formData: FormData): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  const message = String(formData.get('message') ?? '').trim()
  const linkRaw = String(formData.get('link_url') ?? '').trim()
  const projectId = String(formData.get('project_id') ?? '').trim()
  const companyId = String(formData.get('company_id') ?? '').trim()

  if (!title) return { error: 'Give the approval a title.' }

  let link_url: string | null = null
  if (linkRaw) {
    link_url = normaliseUrl(linkRaw)
    if (!link_url) return { error: 'The link must be a valid web address (http/https).' }
  }

  const token = randomBytes(24).toString('base64url')

  const { error } = await supabase.from('approvals').insert({
    token,
    title,
    message: message || null,
    link_url,
    project_id: projectId || null,
    company_id: companyId || null,
    created_by: user.id,
  })
  if (error) return { error: error.message }

  revalidatePath('/approvals')
  return { ok: true, token }
}

export async function revokeApproval(id: string): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('approvals')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('status', 'pending')
  if (error) return { error: error.message }
  revalidatePath('/approvals')
  return { ok: true }
}

// --- Public (no login) — used by /approve/[token] ------------------------------
// Runs with the service-role client and matches strictly on the secret token, so anonymous
// visitors can act on exactly one approval and nothing else.

export async function submitApprovalDecision(
  token: string,
  decision: 'approved' | 'changes_requested',
  name: string,
  comment: string,
): Promise<Result> {
  if (decision !== 'approved' && decision !== 'changes_requested') return { error: 'Invalid decision.' }
  const cleanName = name.trim()
  if (!cleanName) return { error: 'Please enter your name.' }
  const cleanComment = comment.trim()
  if (decision === 'changes_requested' && !cleanComment) {
    return { error: 'Please tell us what changes you’d like.' }
  }

  const adminDb = await createAdminClient()

  const { data: approval } = await adminDb
    .from('approvals')
    .select('id, status')
    .eq('token', token)
    .maybeSingle()

  if (!approval) return { error: 'This approval link is not valid.' }
  if (approval.status !== 'pending') return { error: 'This request has already been actioned.' }

  const { error } = await adminDb
    .from('approvals')
    .update({
      status: decision,
      signed_name: cleanName,
      decision_comment: cleanComment || null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', approval.id)
    .eq('status', 'pending')
  if (error) return { error: error.message }

  revalidatePath(`/approve/${token}`)
  revalidatePath('/approvals')
  return { ok: true }
}
