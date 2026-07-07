'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type Entity = 'company' | 'project'
type Result = { ok?: true; error?: string }

function pathFor(entityType: Entity, entityId: string) {
  return entityType === 'company' ? `/clients/${entityId}` : `/projects/${entityId}`
}

// Only allow http/https links. Prepend https:// if the user omitted the scheme.
// Rejects javascript:, data:, etc.
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

async function me() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, userId: user?.id ?? null }
}

export async function addResourceLink(entityType: Entity, entityId: string, label: string, url: string): Promise<Result> {
  const cleanLabel = label.trim()
  if (!cleanLabel) return { error: 'Give the link a label.' }
  const cleanUrl = normaliseUrl(url)
  if (!cleanUrl) return { error: 'Enter a valid web link (http/https).' }

  const { supabase, userId } = await me()
  if (!userId) return { error: 'Not signed in.' }

  const { error } = await supabase.from('resource_links').insert({
    entity_type: entityType, entity_id: entityId, label: cleanLabel, url: cleanUrl, created_by: userId,
  })
  if (error) return { error: error.message }
  revalidatePath(pathFor(entityType, entityId))
  return { ok: true }
}

export async function removeResourceLink(id: string, entityType: Entity, entityId: string): Promise<Result> {
  const { supabase } = await me()
  const { error } = await supabase.from('resource_links').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(pathFor(entityType, entityId))
  return { ok: true }
}

export async function addCustomField(entityType: Entity, entityId: string, label: string, value: string): Promise<Result> {
  const cleanLabel = label.trim()
  if (!cleanLabel) return { error: 'Give the field a name.' }

  const { supabase, userId } = await me()
  if (!userId) return { error: 'Not signed in.' }

  const { error } = await supabase.from('custom_fields').insert({
    entity_type: entityType, entity_id: entityId, label: cleanLabel, value: value.trim() || null, created_by: userId,
  })
  if (error) return { error: error.message }
  revalidatePath(pathFor(entityType, entityId))
  return { ok: true }
}

export async function updateCustomField(id: string, value: string, entityType: Entity, entityId: string): Promise<Result> {
  const { supabase } = await me()
  const { error } = await supabase
    .from('custom_fields')
    .update({ value: value.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(pathFor(entityType, entityId))
  return { ok: true }
}

export async function removeCustomField(id: string, entityType: Entity, entityId: string): Promise<Result> {
  const { supabase } = await me()
  const { error } = await supabase.from('custom_fields').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(pathFor(entityType, entityId))
  return { ok: true }
}
