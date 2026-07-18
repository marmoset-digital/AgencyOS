// Phase 2c-ii: auto-invoicing engine. Shared by the daily cron and the admin
// "Run auto-invoice now" button. Server-only (service-role DB + Xero write).
import { adminDb, createDraftInvoice, type NewInvoiceLine } from '@/lib/xero'

export interface AutoInvoiceResult {
  period: string
  day: number
  created: { company: string; total: number; invoiceId: string; number?: string }[]
  skippedNoDue: number
  errors: { company: string; error: string }[]
}

// Melbourne "today" as { Y, M, D, lastDay, ymd, period }.
function melbourneToday() {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()) // YYYY-MM-DD
  const [Y, M, D] = ymd.split('-').map(Number)
  const lastDay = new Date(Y, M, 0).getDate()
  const period = `${Y}-${String(M).padStart(2, '0')}`
  const label = new Date(Y, M - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  return { Y, M, D, lastDay, ymd, period, label }
}

interface ChargeRow {
  id: string
  company_id: string
  description: string
  amount: number
  cadence: string
  start_date: string | null
  last_invoiced_period: string | null
}

// Create drafts for every opted-in, linked client whose recurring charge(s) are due
// TODAY (by the day-of-month of each charge's start_date; month-end clamped), for the
// current period, and not already invoiced this period. Retainers only (no hours).
export async function runAutoInvoice(trigger: 'cron' | 'manual' = 'cron'): Promise<AutoInvoiceResult> {
  const admin = adminDb()
  const t = melbourneToday()
  const result: AutoInvoiceResult = { period: t.period, day: t.D, created: [], skippedNoDue: 0, errors: [] }

  // Settings
  const { data: settingsRows } = await admin.from('app_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const r of settingsRows ?? []) settings[r.key] = r.value ?? ''
  const accountCode = (settings.xero_sales_account_code || '200').trim() || '200'
  const dueDays = parseInt(settings.xero_invoice_due_days || '14', 10) || 14
  const GST = 'OUTPUT'

  // Opted-in, linked, active clients
  const { data: companies } = await admin
    .from('companies')
    .select('id, name, xero_contact_id')
    .eq('auto_invoice', true)
    .eq('status', 'active_client')
    .is('archived_at', null)
    .not('xero_contact_id', 'is', null)
  const companyById = new Map((companies ?? []).map(c => [c.id, c]))
  const ids = [...companyById.keys()]
  if (ids.length === 0) return result

  // Their active charges not yet invoiced this period
  const { data: charges } = await admin
    .from('recurring_charges')
    .select('id, company_id, description, amount, cadence, start_date, last_invoiced_period')
    .eq('active', true)
    .in('company_id', ids)

  // Group charges DUE TODAY by company
  const dueByCompany = new Map<string, ChargeRow[]>()
  for (const c of (charges ?? []) as ChargeRow[]) {
    if (!c.start_date) continue                          // need a start date to derive the billing day
    if (c.last_invoiced_period === t.period) continue    // already invoiced this period
    if (c.start_date > t.ymd) continue                   // not started yet
    const billingDay = Number(c.start_date.slice(8, 10))
    const effectiveDay = Math.min(billingDay, t.lastDay) // clamp 31st → last day of short months
    if (effectiveDay !== t.D) continue                   // not this client's billing day today
    if (c.cadence === 'yearly' && Number(c.start_date.slice(5, 7)) !== t.M) continue // yearly: anniversary month only
    const arr = dueByCompany.get(c.company_id) ?? []
    arr.push(c)
    dueByCompany.set(c.company_id, arr)
  }

  const now = new Date().toISOString()
  const due = new Date(Date.now() + dueDays * 86400000)
  const dueDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(due)

  for (const [companyId, cs] of dueByCompany) {
    const company = companyById.get(companyId)!
    const lines: NewInvoiceLine[] = cs.map(c => ({
      Description: c.description, Quantity: 1, UnitAmount: Number(c.amount), AccountCode: accountCode, TaxType: GST,
    }))
    try {
      const created = await createDraftInvoice({
        contactId: company.xero_contact_id!,
        date: t.ymd,
        dueDate,
        reference: `Agency OS — ${t.label}`,
        gstExclusive: true,
        lineItems: lines,
      })
      await admin.from('invoices').upsert({
        xero_invoice_id: created.InvoiceID,
        company_id: companyId,
        invoice_number: created.InvoiceNumber || `DRAFT-${created.InvoiceID.slice(0, 8)}`,
        amount: created.Total ?? 0,
        amount_paid: 0,
        currency: created.CurrencyCode ?? 'AUD',
        status: 'draft',
        issue_date: t.ymd,
        due_date: dueDate,
        line_items: lines,
        xero_synced_at: now,
      }, { onConflict: 'xero_invoice_id' })
      // Mark these charges invoiced for this period (duplicate guard)
      await admin.from('recurring_charges')
        .update({ last_invoiced_period: t.period })
        .in('id', cs.map(c => c.id))
      result.created.push({ company: company.name, total: created.Total ?? 0, invoiceId: created.InvoiceID, number: created.InvoiceNumber })
    } catch (e) {
      result.errors.push({ company: company.name, error: e instanceof Error ? e.message : 'draft failed' })
    }
  }

  if (result.created.length === 0 && result.errors.length === 0) result.skippedNoDue = ids.length

  // Log the run (only when something actually happened) so it's visible in-app.
  if (result.created.length > 0 || result.errors.length > 0) {
    await admin.from('auto_invoice_runs').insert({
      trigger,
      period: t.period,
      created_count: result.created.length,
      details: result.created,
      errors: result.errors,
    })
  }

  return result
}
