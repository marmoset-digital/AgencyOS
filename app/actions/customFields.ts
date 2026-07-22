'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Global custom field DEFINITIONS + per-record values.
// (Ad-hoc one-off fields still live in app/actions/clientData.ts — unchanged.)

type Entity = 'company' | 'project'
type Result = { ok?: true; id?: string; error?: string }

const FIELD_TYPES = ['text', 'number', 'date', 'select'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export type FieldDefinition = {
  id: string
  entity_type: Entity
  label: string
  field_type: FieldType
  options: string[]
  required: boolean
  sort_order: number
}

async function me() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, userId: user?.id ?? null }
}

// Clean a submitted options list: trim, drop blanks, de-dupe, cap length.
function cleanOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const o of raw) {
    const t = String(o ?? '').trim()
    if (t && !seen.has(t)) { seen.add(t); out.push(t) }
    if (out.length >= 50) break
  }
  return out
}

// ── Definitions ──────────────────────────────────────────────────────────────

export async function createDefinition(input: {
  entityType: Entity
  label: string
  fieldType: string
  options?: string[]
  required?: boolean
}): Promise<Result> {
  const { supabase, userId } = await me()
  if (!userId) return { error: 'Not signed in.' }

  const label = input.label.trim()
  if (!label) return { error: 'Give the field a name.' }
  const fieldType = (FIELD_TYPES as readonly string[]).includes(input.fieldType) ? input.fieldType : 'text'
  const options = fieldType === 'select' ? cleanOptions(input.options) : []
  if (fieldType === 'select' && options.length === 0) {
    return { error: 'A dropdown needs at least one option.' }
  }

  // New field goes last in its entity's list.
  const { data: last } = await supabase
    .from('custom_field_definitions')
    .select('sort_order')
    .eq('entity_type', input.entityType)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sort_order = (last?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('custom_field_definitions')
    .insert({
      entity_type: input.entityType,
      label,
      field_type: fieldType,
      options,
      required: !!input.required,
      sort_order,
      created_by: userId,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/settings/custom-fields')
  return { ok: true, id: data.id }
}

export async function updateDefinition(id: string, input: {
  label: string
  fieldType: string
  options?: string[]
  required?: boolean
}): Promise<Result> {
  const { supabase, userId } = await me()
  if (!userId) return { error: 'Not signed in.' }

  const label = input.label.trim()
  if (!label) return { error: 'Give the field a name.' }
  const fieldType = (FIELD_TYPES as readonly string[]).includes(input.fieldType) ? input.fieldType : 'text'
  const options = fieldType === 'select' ? cleanOptions(input.options) : []
  if (fieldType === 'select' && options.length === 0) {
    return { error: 'A dropdown needs at least one option.' }
  }

  const { error } = await supabase
    .from('custom_field_definitions')
    .update({ label, field_type: fieldType, options, required: !!input.required, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/settings/custom-fields')
  return { ok: true }
}

export async function deleteDefinition(id: string): Promise<Result> {
  const { supabase, userId } = await me()
  if (!userId) return { error: 'Not signed in.' }
  // FK is ON DELETE CASCADE, so stored answers go with it.
  const { error } = await supabase.from('custom_field_definitions').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/settings/custom-fields')
  return { ok: true }
}

// Move a definition up/down within its entity list (swap sort_order with the neighbour).
export async function moveDefinition(id: string, direction: 'up' | 'down'): Promise<Result> {
  const { supabase, userId } = await me()
  if (!userId) return { error: 'Not signed in.' }

  const { data: cur } = await supabase
    .from('custom_field_definitions')
    .select('id, entity_type, sort_order')
    .eq('id', id)
    .single()
  if (!cur) return { error: 'Field not found.' }

  const base = supabase
    .from('custom_field_definitions')
    .select('id, sort_order')
    .eq('entity_type', cur.entity_type)
  const { data: neighbour } = direction === 'down'
    ? await base.gt('sort_order', cur.sort_order).order('sort_order', { ascending: true }).limit(1).maybeSingle()
    : await base.lt('sort_order', cur.sort_order).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  if (!neighbour) return { ok: true } // already at the end

  await supabase.from('custom_field_definitions').update({ sort_order: neighbour.sort_order }).eq('id', cur.id)
  await supabase.from('custom_field_definitions').update({ sort_order: cur.sort_order }).eq('id', neighbour.id)

  revalidatePath('/settings/custom-fields')
  return { ok: true }
}

// ── Per-record value ─────────────────────────────────────────────────────────

// Save one record's answer to a global field. Upsert without relying on a unique
// index: look up the existing row, then update or insert.
export async function setDefinitionValue(
  definitionId: string,
  entityType: Entity,
  entityId: string,
  rawValue: string,
): Promise<Result> {
  const { supabase, userId } = await me()
  if (!userId) return { error: 'Not signed in.' }

  const { data: def } = await supabase
    .from('custom_field_definitions')
    .select('label, required')
    .eq('id', definitionId)
    .single()
  if (!def) return { error: 'Field not found.' }

  const value = rawValue.trim()
  // Required bites only when you try to clear it — never forced retroactively.
  if (def.required && !value) return { error: `${def.label} is required.` }

  const { data: existing } = await supabase
    .from('custom_fields')
    .select('id')
    .eq('definition_id', definitionId)
    .eq('entity_id', entityId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('custom_fields')
      .update({ value: value || null, label: def.label, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('custom_fields').insert({
      entity_type: entityType,
      entity_id: entityId,
      definition_id: definitionId,
      label: def.label, // snapshot; display always reads the definition
      value: value || null,
      created_by: userId,
    })
    if (error) return { error: error.message }
  }

  revalidatePath(entityType === 'company' ? `/clients/${entityId}` : `/projects/${entityId}`)
  return { ok: true }
}
