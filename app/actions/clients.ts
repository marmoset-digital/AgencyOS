'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function createCompany(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single()

  const payload = {
    name: formData.get('name') as string,
    industry: (formData.get('industry') as string) || null,
    website: (formData.get('website') as string) || null,
    address: (formData.get('address') as string) || null,
    suburb: (formData.get('suburb') as string) || null,
    state: (formData.get('state') as string) || null,
    postcode: (formData.get('postcode') as string) || null,
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
    address: (formData.get('address') as string) || null,
    suburb: (formData.get('suburb') as string) || null,
    state: (formData.get('state') as string) || null,
    postcode: (formData.get('postcode') as string) || null,
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

// ──────────────────────────────────────────
// CSV Import
// ──────────────────────────────────────────

const VALID_STATUSES = ['lead', 'active_client', 'inactive', 'churned'] as const
const VALID_LEAD_SOURCES = ['website', 'referral', 'linkedin', 'google_ads', 'meta_ads', 'cold_outreach', 'other'] as const
const VALID_LEAD_STAGES = ['new_enquiry', 'proposal_sent', 'negotiation', 'won', 'lost'] as const

function normaliseHeader(h: string): string {
  const norm = h.toLowerCase().trim().replace(/[\s\-/]+/g, '_')
  const map: Record<string, string> = {
    name: 'name', company: 'name', company_name: 'name', organisation: 'name', organization: 'name',
    industry: 'industry', sector: 'industry',
    website: 'website', url: 'website', web: 'website',
    address: 'address', street: 'address', street_address: 'address', address_1: 'address', address_line1: 'address',
    suburb: 'suburb', city: 'suburb', locality: 'suburb', town: 'suburb',
    state: 'state', region: 'state', province: 'state',
    postcode: 'postcode', post_code: 'postcode', postal_code: 'postcode', zip: 'postcode', zip_code: 'postcode',
    abn: 'abn_acn', acn: 'abn_acn', abn_acn: 'abn_acn',
    status: 'status',
    lead_source: 'lead_source', source: 'lead_source',
    lead_stage: 'lead_stage', stage: 'lead_stage',
    estimated_value: 'estimated_value', value: 'estimated_value', deal_value: 'estimated_value',
    notes: 'notes', note: 'notes', comments: 'notes',
    first_name: 'contact_first_name', firstname: 'contact_first_name', contact_first_name: 'contact_first_name',
    last_name: 'contact_last_name', lastname: 'contact_last_name', surname: 'contact_last_name', contact_last_name: 'contact_last_name',
    email: 'contact_email', contact_email: 'contact_email', email_address: 'contact_email',
    phone: 'contact_phone', mobile: 'contact_phone', phone_number: 'contact_phone', contact_phone: 'contact_phone',
    job_title: 'contact_job_title', title: 'contact_job_title', position: 'contact_job_title', role: 'contact_job_title', contact_job_title: 'contact_job_title',
  }
  return map[norm] ?? norm
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/)
  const nonEmpty = lines.filter(l => l.trim().length > 0)
  if (nonEmpty.length < 2) return []

  function parseLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  }

  const rawHeaders = parseLine(nonEmpty[0])
  const headers = rawHeaders.map(normaliseHeader)

  return nonEmpty.slice(1).map(line => {
    const values = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim() })
    return row
  })
}

export type ImportResult = {
  imported: number
  contactsImported: number
  skipped: number
  errors: { row: number; message: string }[]
}

export async function importCompaniesFromCSV(formData: FormData): Promise<ImportResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { imported: 0, contactsImported: 0, skipped: 0, errors: [{ row: 0, message: 'Not authenticated' }] }

  const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single()
  const userId = profile?.id ?? null

  const csvText = formData.get('csv') as string
  if (!csvText?.trim()) {
    return { imported: 0, contactsImported: 0, skipped: 0, errors: [{ row: 0, message: 'No CSV data received' }] }
  }

  const rows = parseCSV(csvText)
  if (rows.length === 0) {
    return { imported: 0, contactsImported: 0, skipped: 0, errors: [{ row: 0, message: 'CSV is empty or could not be parsed' }] }
  }

  let imported = 0
  let contactsImported = 0
  let skipped = 0
  const errors: { row: number; message: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2

    const name = row['name']?.trim()
    if (!name) {
      errors.push({ row: rowNum, message: 'Company name is required' })
      skipped++
      continue
    }

    const rawStatus = row['status']?.toLowerCase().trim()
    const normStatus = rawStatus === 'active' ? 'active_client' : rawStatus
    const status = VALID_STATUSES.includes(normStatus as any) ? normStatus : 'lead'
    const rawLeadSource = row['lead_source']?.toLowerCase().trim().replace(/\s+/g, '_')
    const lead_source = VALID_LEAD_SOURCES.includes(rawLeadSource as any) ? rawLeadSource : null
    const rawLeadStage = row['lead_stage']?.toLowerCase().trim().replace(/\s+/g, '_')
    const lead_stage = VALID_LEAD_STAGES.includes(rawLeadStage as any) ? rawLeadStage : null
    const rawValue = row['estimated_value']?.replace(/[$,\s]/g, '')
    const estimated_value = rawValue && !isNaN(parseFloat(rawValue)) ? parseFloat(rawValue) : null

    const companyPayload = {
      name,
      industry: row['industry'] || null,
      website: row['website'] || null,
      address: row['address'] || null,
      suburb: row['suburb'] || null,
      state: row['state'] || null,
      postcode: row['postcode'] || null,
      abn_acn: row['abn_acn'] || null,
      status,
      lead_source,
      lead_stage,
      estimated_value,
      notes: row['notes'] || null,
      created_by: userId,
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert(companyPayload)
      .select('id')
      .single()

    if (companyError) {
      errors.push({ row: rowNum, message: `${name}: ${companyError.message}` })
      skipped++
      continue
    }

    imported++

    const contactEmail = row['contact_email']?.trim()
    const contactFirstName = row['contact_first_name']?.trim()
    const contactLastName = row['contact_last_name']?.trim()

    if (contactEmail || contactFirstName || contactLastName) {
      if (!contactFirstName || !contactLastName || !contactEmail) {
        errors.push({ row: rowNum, message: `${name}: Contact skipped — first name, last name, and email are all required for contact import` })
      } else {
        const contactPayload = {
          company_id: company.id,
          first_name: contactFirstName,
          last_name: contactLastName,
          email: contactEmail,
          phone: row['contact_phone'] || null,
          job_title: row['contact_job_title'] || null,
          is_primary: true,
          portal_access: false,
          notification_preferences: { project_updates: true, invoice_notifications: true, approval_requests: true, ticket_updates: true },
        }
        const { error: contactError } = await supabase.from('contacts').insert(contactPayload)
        if (contactError) {
          errors.push({ row: rowNum, message: `${name}: Contact error — ${contactError.message}` })
        } else {
          contactsImported++
        }
      }
    }
  }

  return { imported, contactsImported, skipped, errors }
}

// ──────────────────────────────────────────
// Contacts
// ──────────────────────────────────────────

export async function createContact(companyId: string, formData: FormData) {
  const supabase = await createClient()

  const payload = {
    company_id: companyId,
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    email: formData.get('email') as string,
    phone: (formData.get('phone') as string) || null,
    job_title: (formData.get('job_title') as string) || null,
    is_primary: formData.get('is_primary') === 'on',
    portal_access: false,
    notification_preferences: {
      project_updates: true,
      invoice_notifications: true,
      approval_requests: true,
      ticket_updates: true,
    },
  }

  if (!payload.first_name || !payload.last_name || !payload.email) {
    return { error: 'First name, last name, and email are required' }
  }

  const { error } = await supabase.from('contacts').insert(payload)
  if (error) return { error: error.message }

  revalidatePath(`/clients/${companyId}`)
  redirect(`/clients/${companyId}`)
}

export async function updateContact(contactId: string, companyId: string, formData: FormData) {
  const supabase = await createClient()

  const payload = {
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    email: formData.get('email') as string,
    phone: (formData.get('phone') as string) || null,
    job_title: (formData.get('job_title') as string) || null,
    is_primary: formData.get('is_primary') === 'on',
  }

  const { error } = await supabase.from('contacts').update(payload).eq('id', contactId)
  if (error) return { error: error.message }

  revalidatePath(`/clients/${companyId}`)
  redirect(`/clients/${companyId}`)
}

export async function deleteContact(contactId: string, companyId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('contacts').delete().eq('id', contactId)
  if (error) return { error: error.message }
  revalidatePath(`/clients/${companyId}`)
}
