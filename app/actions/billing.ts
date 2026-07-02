'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: 'Not authenticated' as const }
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return { supabase, error: 'Admins only' as const }
  return { supabase, error: null }
}

// ── Global default rates (app_settings) ──────────────────────────────────
export async function updateSettings(formData: FormData) {
  const { error } = await requireAdmin()
  if (error) return { error }
  const supabase = await createClient()

  const billable = (formData.get('default_billable_rate') as string) || '0'
  const cost = (formData.get('default_cost_rate') as string) || '0'
  const now = new Date().toISOString()

  const { error: e } = await supabase.from('app_settings').upsert([
    { key: 'default_billable_rate', value: billable, updated_at: now },
    { key: 'default_cost_rate', value: cost, updated_at: now },
  ], { onConflict: 'key' })
  if (e) return { error: e.message }

  revalidatePath('/settings')
  revalidatePath('/invoices')
}

// ── Per-team-member cost rate (needs admin client: RLS allows self-update only) ──
export async function updateUserCostRate(formData: FormData) {
  const { error } = await requireAdmin()
  if (error) return { error }

  const userId = formData.get('user_id') as string
  const raw = (formData.get('cost_rate') as string) ?? ''
  const rate = raw === '' ? null : parseFloat(raw)

  const admin = await createAdminClient()
  const { error: e } = await admin.from('users').update({ cost_rate: rate }).eq('id', userId)
  if (e) return { error: e.message }

  revalidatePath('/settings')
  revalidatePath('/invoices')
}

// ── Per-client billable rate override ────────────────────────────────────
export async function updateCompanyBillableRate(companyId: string, raw: string) {
  const supabase = await createClient()
  const rate = raw === '' ? null : parseFloat(raw)
  const { error } = await supabase.from('companies').update({ billable_rate: rate }).eq('id', companyId)
  if (error) return { error: error.message }
  revalidatePath('/invoices')
}

// ── Recurring charges (monthly retainers + yearly fees) ──────────────────
export async function addRecurringCharge(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const companyId = formData.get('company_id') as string
  const description = (formData.get('description') as string || '').trim()
  const amount = parseFloat(formData.get('amount') as string)
  const cadence = (formData.get('cadence') as string) || 'monthly'
  const startDate = formData.get('start_date') as string

  if (!companyId || !description || isNaN(amount)) {
    return { error: 'Description and a valid amount are required' }
  }

  const payload: Record<string, unknown> = { company_id: companyId, description, amount, cadence }
  if (startDate) payload.start_date = startDate

  const { error } = await supabase.from('recurring_charges').insert(payload)
  if (error) return { error: error.message }
  revalidatePath('/invoices')
}

export async function toggleRecurringCharge(id: string, active: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from('recurring_charges').update({ active }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/invoices')
}

export async function deleteRecurringCharge(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('recurring_charges').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/invoices')
}
