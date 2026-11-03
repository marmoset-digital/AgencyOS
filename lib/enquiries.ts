import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeTotals, headlineValue, normaliseContent } from '@/lib/proposalPricing'
import { proposalSentEmail, sendClientEmail } from '@/lib/notify'
import { siteOrigin } from '@/lib/publicUrl'

// Core logic for the enquiry -> proposal automation (step 8). Called from the
// /api/intake and /api/automation routes with the SERVICE-ROLE client, so it does
// not depend on a signed-in user. Every write here is idempotent by a natural key,
// because n8n delivers at-least-once and may repeat a call.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped schema, as in lib/events.ts
type Db = SupabaseClient<any, any, any>

export interface EnquiryInput {
  source: string
  formId: string | null
  entryId: string | null
  firstName: string | null
  lastName: string | null
  email: string
  phone: string | null
  companyName: string | null
  website: string | null
  serviceInterest: string | null
  message: string | null
  raw: Record<string, unknown>
}

const clean = (v: unknown, max = 500): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

// Map a form submission onto our fields. The Gravity Forms webhook feed is set up to
// send these exact keys (see APPLY.md); a single "name" field is split as a fallback.
export function parseSubmission(body: Record<string, unknown>, source = 'website'): EnquiryInput | { error: string } {
  const email = clean(body.email, 254)?.toLowerCase() ?? null
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'A valid email is required.' }

  let firstName = clean(body.first_name, 100)
  let lastName = clean(body.last_name, 100)
  const full = clean(body.name, 200)
  if (!firstName && !lastName && full) {
    const parts = full.split(/\s+/)
    firstName = parts.shift() ?? null
    lastName = parts.join(' ') || null
  }

  return {
    source,
    formId: clean(body.form_id, 50),
    entryId: clean(body.entry_id, 50),
    firstName,
    lastName,
    email,
    phone: clean(body.phone, 50),
    companyName: clean(body.company, 200),
    website: clean(body.website, 300),
    serviceInterest: clean(body.service, 200),
    message: clean(body.message, 8000),
    raw: body,
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

async function findContactByEmail(db: Db, email: string) {
  const { data } = await db
    .from('contacts')
    .select('id, company_id, first_name')
    .ilike('email', escapeLike(email))
    .limit(1)
    .maybeSingle()
  return data as { id: string; company_id: string; first_name: string | null } | null
}

// Store an enquiry. Links it to an existing client when the email matches a contact,
// but never creates a company: that happens on approval. A repeated webhook (same
// form + entry id) returns the existing row instead of a duplicate.
export async function recordEnquiry(db: Db, input: EnquiryInput): Promise<{ id: string; duplicate: boolean } | { error: string }> {
  if (input.entryId) {
    const { data: existing } = await db
      .from('enquiries')
      .select('id')
      .eq('source', input.source)
      .eq('form_id', input.formId ?? '')
      .eq('entry_id', input.entryId)
      .maybeSingle()
    if (existing) return { id: existing.id, duplicate: true }
  }

  const match = await findContactByEmail(db, input.email)

  const { data, error } = await db
    .from('enquiries')
    .insert({
      source: input.source,
      form_id: input.formId ?? (input.entryId ? '' : null),
      entry_id: input.entryId,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone: input.phone,
      company_name: input.companyName,
      website: input.website,
      service_interest: input.serviceInterest,
      message: input.message,
      raw: input.raw,
      company_id: match?.company_id ?? null,
      contact_id: match?.id ?? null,
    })
    .select('id')
    .single()

  if (error) {
    // Lost a race with a concurrent retry of the same entry: return the winner.
    if (error.code === '23505' && input.entryId) {
      const { data: winner } = await db
        .from('enquiries').select('id')
        .eq('source', input.source).eq('form_id', input.formId ?? '').eq('entry_id', input.entryId)
        .maybeSingle()
      if (winner) return { id: winner.id, duplicate: true }
    }
    return { error: error.message }
  }
  return { id: data.id, duplicate: false }
}

const ENQUIRY_STATUSES = ['new', 'spam', 'poor_fit', 'declined', 'approved', 'proposal_sent'] as const
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number]
export const isEnquiryStatus = (s: unknown): s is EnquiryStatus =>
  typeof s === 'string' && (ENQUIRY_STATUSES as readonly string[]).includes(s)

// Record the AI triage and/or a human decision on an enquiry.
export async function updateEnquiry(
  db: Db,
  id: string,
  patch: {
    status?: EnquiryStatus
    aiVerdict?: string | null
    aiSummary?: string | null
    aiModel?: string | null
    decidedBy?: string | null
  },
): Promise<{ ok: true } | { error: string; status?: number }> {
  const row: Record<string, unknown> = {}
  if (patch.status) row.status = patch.status
  if (patch.aiVerdict !== undefined || patch.aiSummary !== undefined) {
    row.ai_verdict = clean(patch.aiVerdict, 50)
    row.ai_summary = clean(patch.aiSummary, 4000)
    row.ai_model = clean(patch.aiModel, 100)
    row.triaged_at = new Date().toISOString()
  }
  if (patch.decidedBy !== undefined) {
    row.decided_by = clean(patch.decidedBy, 200)
    row.decided_at = new Date().toISOString()
  }
  if (!Object.keys(row).length) return { error: 'Nothing to update.', status: 400 }

  // Never move an enquiry backwards once its proposal has gone out.
  const { data: current } = await db.from('enquiries').select('status').eq('id', id).maybeSingle()
  if (!current) return { error: 'Enquiry not found.', status: 404 }
  if (current.status === 'proposal_sent' && row.status && row.status !== 'proposal_sent') delete row.status

  const { error } = await db.from('enquiries').update(row).eq('id', id)
  if (error) return { error: error.message }
  return { ok: true }
}

export interface SendProposalResult {
  ok: true
  proposalId: string
  proposalNumber: string | null
  url: string
  companyId: string
  contactId: string
  emailed: boolean      // true only when THIS call sent the client email
  existing: boolean     // true when the proposal already existed (a repeated call)
}

// Approve an enquiry: make sure the client and contact exist, create the proposal from
// the named template, mark it sent (which fires proposal.sent) and email the client.
// Safe to call twice: the second call finds the proposal by enquiry_id and does nothing.
export async function sendProposalForEnquiry(
  db: Db,
  opts: { enquiryId: string; templateName: string; decidedBy?: string | null },
): Promise<SendProposalResult | { error: string; status?: number }> {
  const { data: enquiry } = await db.from('enquiries').select('*').eq('id', opts.enquiryId).maybeSingle()
  if (!enquiry) return { error: 'Enquiry not found.', status: 404 }

  // Already done? Return it without re-sending anything.
  const { data: prior } = await db
    .from('proposals')
    .select('id, title, proposal_number, token, status, company_id, contact_id')
    .eq('enquiry_id', enquiry.id)
    .maybeSingle()
  if (prior && prior.status !== 'draft') {
    return {
      ok: true, proposalId: prior.id, proposalNumber: prior.proposal_number,
      url: `${siteOrigin()}/proposal/${prior.token}`,
      companyId: prior.company_id, contactId: prior.contact_id, emailed: false, existing: true,
    }
  }

  // 1. Client (company). Reuse the one linked at intake, or one found by contact email.
  let companyId: string | null = enquiry.company_id
  let contactId: string | null = enquiry.contact_id
  if (!companyId) {
    const match = await findContactByEmail(db, enquiry.email)
    if (match) { companyId = match.company_id; contactId = match.id }
  }
  if (!companyId) {
    const name =
      enquiry.company_name ||
      [enquiry.first_name, enquiry.last_name].filter(Boolean).join(' ') ||
      enquiry.email
    const { data: company, error } = await db
      .from('companies')
      .insert({
        name,
        website: enquiry.website,
        status: 'lead',
        lead_source: enquiry.source === 'website' ? 'website' : 'other',
        lead_stage: 'new_enquiry',
        notes: enquiry.message ? `Website enquiry:\n${enquiry.message}` : null,
      })
      .select('id')
      .single()
    if (error) return { error: `Could not create client: ${error.message}` }
    companyId = company.id
  }
  // Remember the link straight away, so a retry after a timeout reuses this client.
  await db.from('enquiries').update({ company_id: companyId }).eq('id', enquiry.id)

  // 2. Contact.
  if (!contactId) {
    const { data: primary } = await db
      .from('contacts').select('id').eq('company_id', companyId).eq('is_primary', true).limit(1).maybeSingle()
    const { data: contact, error } = await db
      .from('contacts')
      .insert({
        company_id: companyId,
        first_name: enquiry.first_name || enquiry.email.split('@')[0],
        last_name: enquiry.last_name || '',
        email: enquiry.email,
        phone: enquiry.phone,
        is_primary: !primary,
        portal_access: false,
      })
      .select('id')
      .single()
    if (error) return { error: `Could not create contact: ${error.message}` }
    contactId = contact.id
  }
  await db.from('enquiries').update({ contact_id: contactId }).eq('id', enquiry.id)

  // 3. Proposal from the template (or finish a draft a previous attempt left behind).
  let proposal = prior
  if (!proposal) {
    const { data: template } = await db
      .from('proposal_templates').select('id, name, content').eq('name', opts.templateName).maybeSingle()
    if (!template) return { error: `Proposal template "${opts.templateName}" not found.`, status: 400 }

    const content = normaliseContent(template.content)
    const { data: created, error } = await db
      .from('proposals')
      .insert({
        company_id: companyId,
        contact_id: contactId,
        title: template.name,
        content,
        total_value: headlineValue(computeTotals(content)),
        status: 'draft',
        token: randomBytes(24).toString('base64url'),
        enquiry_id: enquiry.id,
        template_id: template.id,
      })
      .select('id, title, proposal_number, token, status, company_id, contact_id')
      .single()
    if (error) {
      if (error.code === '23505') {
        // A concurrent call created it first. Treat as a repeat.
        return sendProposalForEnquiry(db, opts)
      }
      return { error: `Could not create proposal: ${error.message}` }
    }
    proposal = created
  }

  // 4. Mark sent. Guarded on status so only one caller ever wins the transition and
  //    sends the email. The status change fires the proposal.sent event.
  const { data: sent } = await db
    .from('proposals')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', proposal!.id)
    .eq('status', 'draft')
    .select('id')
  const wonTransition = (sent?.length ?? 0) > 0

  const url = `${siteOrigin()}/proposal/${proposal!.token}`
  let emailed = false
  if (wonTransition) {
    const mail = proposalSentEmail(enquiry.first_name, proposal!.title ?? opts.templateName, url)
    emailed = await sendClientEmail(enquiry.email, mail.subject, mail.html)

    await db.from('companies')
      .update({ lead_stage: 'proposal_sent' })
      .eq('id', companyId).eq('status', 'lead')
    await db.from('enquiries')
      .update({
        status: 'proposal_sent',
        decided_by: opts.decidedBy ?? enquiry.decided_by ?? null,
        decided_at: enquiry.decided_at ?? new Date().toISOString(),
      })
      .eq('id', enquiry.id)
  }

  return {
    ok: true, proposalId: proposal!.id, proposalNumber: proposal!.proposal_number, url,
    companyId: companyId!, contactId: contactId!, emailed, existing: !wonTransition,
  }
}
