'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const PRICING = ['fixed', 'subscription', 'hourly'] as const
type Result = { ok?: true; error?: string }

function num(fd: FormData, key: string): number | null {
  const v = String(fd.get(key) ?? '').trim()
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function readService(fd: FormData) {
  const name = String(fd.get('name') ?? '').trim()
  const pricing_type = String(fd.get('pricing_type') ?? 'fixed')
  return {
    name,
    description: String(fd.get('description') ?? '').trim() || null,
    pricing_type,
    fixed_price: pricing_type === 'fixed' ? num(fd, 'fixed_price') : null,
    monthly_fee: pricing_type === 'subscription' ? num(fd, 'monthly_fee') : null,
    hourly_rate: pricing_type === 'hourly' ? num(fd, 'hourly_rate') : null,
    sort_order: num(fd, 'sort_order') ?? 0,
  }
}

export async function createService(formData: FormData): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const s = readService(formData)
  if (!s.name) return { error: 'Give the service a name.' }
  if (!PRICING.includes(s.pricing_type as (typeof PRICING)[number])) return { error: 'Pick a pricing type.' }

  const { error } = await supabase.from('services').insert({ ...s, is_active: true })
  if (error) return { error: error.message }
  revalidatePath('/services')
  return { ok: true }
}

export async function updateService(id: string, formData: FormData): Promise<Result> {
  const supabase = await createClient()
  const s = readService(formData)
  if (!s.name) return { error: 'Give the service a name.' }
  if (!PRICING.includes(s.pricing_type as (typeof PRICING)[number])) return { error: 'Pick a pricing type.' }

  const { error } = await supabase.from('services').update(s).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/services')
  return { ok: true }
}

export async function setServiceActive(id: string, active: boolean): Promise<Result> {
  const supabase = await createClient()
  const { error } = await supabase.from('services').update({ is_active: active }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/services')
  return { ok: true }
}
