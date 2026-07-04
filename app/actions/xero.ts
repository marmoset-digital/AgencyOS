'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  adminDb, disconnect, markSynced, fetchOutstandingInvoices, fetchContacts,
  createDraftInvoice, mapStatus, xeroDate,
  type XeroContact, type NewInvoiceLine,
} from '@/lib/xero'

// Melbourne-time month window (mirrors the Billing page).
function monthWindow(monthStr?: string) {
  const melNow = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit',
  }).format(new Date())
  const ym = monthStr && /^\d{4}-\d{2}$/.test(monthStr) ? monthStr : melNow
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const label = new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  return { ym, y, m, start: `${ym}-01`, end: `${ym}-${String(lastDay).padStart(2, '0')}`, label }
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' as const }
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return { error: 'Admins only' as const }
  return { error: null }
}

// Pull sales invoices from Xero and upsert into `invoices`, matched to companies
// via companies.xero_contact_id. Invoices whose Xero contact isn't linked are skipped.
export async function syncInvoices(): Promise<{ error?: string; synced?: number; skipped?: number; reconciled?: number }> {
  const { error } = await requireAdmin()
  if (error) return { error }

  const admin = adminDb()

  // contactId -> companyId
  const { data: companies } = await admin
    .from('companies').select('id, xero_contact_id').not('xero_contact_id', 'is', null)
  const companyByContact = new Map<string, string>()
  for (const c of companies ?? []) if (c.xero_contact_id) companyByContact.set(c.xero_contact_id, c.id)

  let invoices
  try {
    invoices = await fetchOutstandingInvoices() // ACCREC + AUTHORISED only (outstanding)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Xero sync failed' }
  }

  const now = new Date().toISOString()
  let synced = 0, skipped = 0
  const rows = []
  const seenXeroIds = new Set<string>()
  for (const inv of invoices) {
    const contactId = inv.Contact?.ContactID
    const companyId = contactId ? companyByContact.get(contactId) : undefined
    if (!companyId) { skipped++; continue }
    const due = xeroDate(inv.DueDate)
    seenXeroIds.add(inv.InvoiceID)
    rows.push({
      xero_invoice_id: inv.InvoiceID,
      company_id: companyId,
      invoice_number: inv.InvoiceNumber || `XERO-${inv.InvoiceID.slice(0, 8)}`,
      amount: inv.Total ?? 0,
      amount_paid: inv.AmountPaid ?? 0,
      currency: inv.CurrencyCode ?? 'AUD',
      status: mapStatus(inv.Status, due, inv.AmountDue),
      issue_date: xeroDate(inv.Date),
      due_date: due,
      paid_date: xeroDate(inv.FullyPaidOnDate),
      line_items: inv.LineItems ?? [],
      xero_synced_at: now,
    })
    synced++
  }

  if (rows.length) {
    const { error: e } = await admin.from('invoices').upsert(rows, { onConflict: 'xero_invoice_id' })
    if (e) return { error: e.message }
  }

  // Reconcile: any invoice we previously had as open (sent/overdue) for a linked
  // client that's no longer in the outstanding set has been paid (or voided) in Xero
  // — mark it paid so the dashboard's overdue list stays accurate.
  const linkedCompanyIds = [...new Set(companyByContact.values())]
  let reconciled = 0
  if (linkedCompanyIds.length) {
    const { data: openOurs } = await admin
      .from('invoices').select('id, xero_invoice_id')
      .in('company_id', linkedCompanyIds).in('status', ['sent', 'overdue'])
    const droppedIds = (openOurs ?? [])
      .filter(o => o.xero_invoice_id && !seenXeroIds.has(o.xero_invoice_id))
      .map(o => o.id)
    if (droppedIds.length) {
      await admin.from('invoices').update({ status: 'paid', xero_synced_at: now }).in('id', droppedIds)
      reconciled = droppedIds.length
    }
  }

  await markSynced()

  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  revalidatePath('/settings')
  return { synced, skipped, reconciled }
}

export async function disconnectXero() {
  const { error } = await requireAdmin()
  if (error) return { error }
  await disconnect()
  revalidatePath('/settings')
  revalidatePath('/dashboard')
}

// For the per-client link UI: list of Xero contacts to choose from.
export async function getXeroContacts(): Promise<{ contacts?: XeroContact[]; error?: string }> {
  const { error } = await requireAdmin()
  if (error) return { error }
  try {
    return { contacts: await fetchContacts() }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not load Xero contacts' }
  }
}

// Create a DRAFT sales invoice in Xero for one client for the given month, from the
// billing summary (recurring charges due + billable hours × rate). GST-exclusive.
export async function createXeroDraftInvoice(
  companyId: string, monthStr?: string,
): Promise<{ error?: string; invoiceId?: string; number?: string; total?: number }> {
  const { error } = await requireAdmin()
  if (error) return { error }

  const admin = adminDb()
  const period = monthWindow(monthStr)

  const { data: company } = await admin
    .from('companies').select('id, name, billable_rate, xero_contact_id').eq('id', companyId).single()
  if (!company) return { error: 'Client not found.' }
  if (!company.xero_contact_id) return { error: 'Link this client to a Xero contact first (in Settings).' }

  // Settings: default billable rate, sales account code, due days
  const { data: settingsRows } = await admin.from('app_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const r of settingsRows ?? []) settings[r.key] = r.value ?? ''
  const defaultBillable = parseFloat(settings.default_billable_rate || '0') || 0
  // Always send an account code (Xero AU default sales = 200) so the draft is complete.
  const accountCode = (settings.xero_sales_account_code || '200').trim() || '200'
  const dueDays = parseInt(settings.xero_invoice_due_days || '14', 10) || 14
  const billableRate = company.billable_rate != null ? Number(company.billable_rate) : defaultBillable
  // GST on Income (10%) — AU system tax type. Amounts are GST-exclusive (added on top).
  const GST = 'OUTPUT'

  const lines: NewInvoiceLine[] = []
  const includedChargeIds: string[] = []

  // Recurring charges due this month (monthly always; yearly when start month matches)
  const { data: charges } = await admin
    .from('recurring_charges').select('*').eq('company_id', companyId).eq('active', true)
  for (const c of charges ?? []) {
    const started = c.start_date == null || c.start_date <= period.end
    const due = c.cadence === 'monthly' ? started
      : started && c.start_date != null && Number(String(c.start_date).slice(5, 7)) === period.m
    if (due) {
      lines.push({ Description: c.description, Quantity: 1, UnitAmount: Number(c.amount), AccountCode: accountCode, TaxType: GST })
      includedChargeIds.push(c.id)
    }
  }

  // Billable hours this month (via the client's projects)
  const { data: projects } = await admin.from('projects').select('id').eq('company_id', companyId)
  const projectIds = (projects ?? []).map(p => p.id)
  if (projectIds.length) {
    const { data: logs } = await admin
      .from('time_logs').select('duration_minutes')
      .in('project_id', projectIds).eq('is_billable', true)
      .gte('logged_at', period.start).lte('logged_at', period.end)
    const mins = (logs ?? []).reduce((s, l) => s + (l.duration_minutes ?? 0), 0)
    if (mins > 0 && billableRate > 0) {
      const hours = Math.round((mins / 60) * 100) / 100
      lines.push({
        Description: `Billable hours — ${period.label}`,
        Quantity: hours, UnitAmount: billableRate, AccountCode: accountCode, TaxType: GST,
      })
    }
  }

  if (lines.length === 0) return { error: `Nothing to invoice for ${company.name} in ${period.label}.` }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date())
  const due = new Date(Date.now() + dueDays * 86400000)
  const dueDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(due)

  let created
  try {
    created = await createDraftInvoice({
      contactId: company.xero_contact_id,
      date: today,
      dueDate,
      reference: `Agency OS — ${period.label}`,
      gstExclusive: true,
      lineItems: lines,
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create the Xero draft.' }
  }

  // Write the draft back into our invoices table
  await admin.from('invoices').upsert({
    xero_invoice_id: created.InvoiceID,
    company_id: companyId,
    invoice_number: created.InvoiceNumber || `DRAFT-${created.InvoiceID.slice(0, 8)}`,
    amount: created.Total ?? 0,
    amount_paid: 0,
    currency: created.CurrencyCode ?? 'AUD',
    status: 'draft',
    issue_date: today,
    due_date: dueDate,
    line_items: lines,
    xero_synced_at: new Date().toISOString(),
  }, { onConflict: 'xero_invoice_id' })

  // Mark included recurring charges invoiced for this period so auto-invoicing won't double up.
  if (includedChargeIds.length) {
    await admin.from('recurring_charges').update({ last_invoiced_period: period.ym }).in('id', includedChargeIds)
  }

  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  return { invoiceId: created.InvoiceID, number: created.InvoiceNumber, total: created.Total }
}

// Per-client auto-invoice opt-in toggle.
export async function setAutoInvoice(companyId: string, on: boolean) {
  const { error } = await requireAdmin()
  if (error) return { error }
  const admin = adminDb()
  const { error: e } = await admin.from('companies').update({ auto_invoice: on }).eq('id', companyId)
  if (e) return { error: e.message }
  revalidatePath('/invoices')
}

// Admin "Run auto-invoice now" — runs today's due auto-invoicing on demand (same as the cron).
export async function runAutoInvoiceNow(): Promise<{ error?: string; created?: number; clients?: string[]; errors?: string[] }> {
  const { error } = await requireAdmin()
  if (error) return { error }
  const { runAutoInvoice } = await import('@/lib/autoInvoice')
  try {
    const r = await runAutoInvoice()
    revalidatePath('/invoices')
    revalidatePath('/dashboard')
    return {
      created: r.created.length,
      clients: r.created.map(c => `${c.company} ($${c.total.toLocaleString('en-AU')})`),
      errors: r.errors.map(e => `${e.company}: ${e.error}`),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Auto-invoice run failed' }
  }
}

// Link (or clear) a company's Xero contact.
export async function linkCompanyToXeroContact(companyId: string, xeroContactId: string) {
  const { error } = await requireAdmin()
  if (error) return { error }
  const admin = adminDb()
  const value = xeroContactId === '' ? null : xeroContactId
  const { error: e } = await admin.from('companies').update({ xero_contact_id: value }).eq('id', companyId)
  if (e) return { error: e.message }
  revalidatePath('/settings')
  revalidatePath('/invoices')
}
