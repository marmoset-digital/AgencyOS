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

  const csvText = formData.get('csv') as string
  if (!csvText?.trim()) {
    return { imported: 0, contactsImported: 0, skipped: 0, errors: [{ row: 0, message: 'No CSV data received' }] }
  }

  const rows = parseCSV(csvText)
  if (rows.length === 0) {
    return { imported: 0, contactsImported: 0, skipped: 0, errors: [{ row: 0, message: 'CSV is empty or could not be parsed' }] }
  }

  const errors: { row: number; message: string }[] = []
  const companyPayloads: Record<string, unknown>[] = []
  const rowIndexMap: number[] = [] // maps companyPayloads index → original row number

  // ── 1. Validate and build company payloads ──────────────────────
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2

    const name = row['name']?.trim()
    if (!name) {
      errors.push({ row: rowNum, message: 'Company name is required' })
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

    companyPayloads.push({
      name,
      industry: row['industry'] || null,
      website: row['website'] || null,
      address: row['address'] || null,
      suburb: row['suburb'] || null,
      state: row['state'] || null,
      postcode: row['postcode'] || null,
      status,
      lead_source,
      lead_stage,
      lead_estimated_value: estimated_value,
      notes: row['notes'] || null,
    })
    rowIndexMap.push(rowNum)
  }

  if (companyPayloads.length === 0) {
    return { imported: 0, contactsImported: 0, skipped: errors.length, errors }
  }

  // ── 2. Bulk insert all companies ────────────────────────────────
  const { data: insertedCompanies, error: bulkError } = await supabase
    .from('companies')
    .insert(companyPayloads)
    .select('id, name')

  if (bulkError) {
    errors.push({ row: 0, message: `Bulk insert failed: ${bulkError.message}` })
    return { imported: 0, contactsImported: 0, skipped: companyPayloads.length, errors }
  }

  const imported = insertedCompanies?.length ?? 0

  // ── 3. Build contact payloads ───────────────────────────────────
  const contactPayloads: Record<string, unknown>[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2
    const name = row['name']?.trim()
    if (!name) continue

    const company = insertedCompanies?.find(c => c.name === name)
    if (!company) continue

    const contactEmail = row['contact_email']?.trim()
    const contactFirstName = row['contact_first_name']?.trim()
    const contactLastName = row['contact_last_name']?.trim()

    if (contactEmail || contactFirstName || contactLastName) {
      if (!contactFirstName || !contactLastName || !contactEmail) {
        errors.push({
          row: rowNum,
          message: `${name}: Contact skipped — first name, last name, and email are all required`,
        })
      } else {
        contactPayloads.push({
          company_id: company.id,
          first_name: contactFirstName,
          last_name: contactLastName,
          email: contactEmail,
          phone: row['contact_phone'] || null,
          job_title: row['contact_job_title'] || null,
          portal_access: false,
          notification_preferences: {
            project_status_change: true,
            invoice_sent: true,
            approval_request: true,
            ticket_update: true,
            subscription_renewal: true,
          },
        })
      }
    }
  }

  // ── 4. Bulk insert all contacts ─────────────────────────────────
  let contactsImported = 0
  if (contactPayloads.length > 0) {
    const { data: insertedContacts, error: contactBulkError } = await supabase
      .from('contacts')
      .insert(contactPayloads)
      .select('id')

    if (contactBulkError) {
      errors.push({ row: 0, message: `Contact bulk insert failed: ${contactBulkError.message}` })
    } else {
      contactsImported = insertedContacts?.length ?? 0
    }
  }

  return { imported, contactsImported, skipped: errors.filter(e => e.row > 0 && !e.message.includes('Contact skipped')).length, errors }
}
