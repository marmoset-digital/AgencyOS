'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function createCompany(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single()

  const payload = {
    name: formData.get('name') as string,
    industry: (formData.get('industry') as string) || null,
    website: (formData.get('website') as string) || null,
    billing_address: (formData.get('billing_address') as string) || null,
    abn_acn: (formData.get('abn_acn') as string) || null,
    status: (formData.get('status') as string) || 'lead',
    lead_source: (formData.get('lead_source') as string) || null,
    lead_stage: (formData.get('lead_stage') as string) || null,
    estimated_value: formData.get('estimated_value') ? parseFloat(formData.get('estimated_value') as string) : null,
    notes: (formData.get('notes') as string) || null,
    created_by: profile?.id ?? null,
  }

  const { data, error } = await supabase.from('companies').insert(payload).select('id').single()

  if (error) return { error: error.message }

  redirect(`/clients/${data.id}`)
}

export async function updateCompany(id: string, formData: FormData) {
  const supabase = await createClient()

  const payload = {
    name: formData.get('name') as string,
    industry: (formData.get('industry') as string) || null,
    website: (formData.get('website') as string) || null,
    billing_address: (formData.get('billing_address') as string) || null,
    abn_acn: (formData.get('abn_acn') as string) || null,
    status: formData.get('status') as string,
    lead_source: (formData.get('lead_source') as string) || null,
    lead_stage: (formData.get('lead_stage') as string) || null,
    estimated_value: formData.get('estimated_value') ? parseFloat(formData.get('estimated_value') as string) : null,
    notes: (formData.get('notes') as string) || null,
  }

  const { error } = await supabase.from('companies').update(payload).eq('id', id)

  if (error) return { error: error.message }

  redirect(`/clients/${id}`)
}
