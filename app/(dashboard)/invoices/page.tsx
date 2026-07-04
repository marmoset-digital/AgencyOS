import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import BillingTable from './BillingTable'
import type { RecurringCharge, BillingRow } from './BillingTable'

export const metadata = { title: 'Billing' }

function monthPeriod(monthStr?: string) {
  const melNow = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit',
  }).format(new Date()) // YYYY-MM
  const ym = monthStr && /^\d{4}-\d{2}$/.test(monthStr) ? monthStr : melNow
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const start = `${ym}-01`
  const end = `${ym}-${String(lastDay).padStart(2, '0')}`
  const prev = new Date(y, m - 2, 1)
  const next = new Date(y, m, 1)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const label = new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  return { ym, y, m, start, end, prev: fmt(prev), next: fmt(next), label }
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { month } = await searchParams
  const period = monthPeriod(month)

  // Rates
  const { data: settingsRows } = await supabase.from('app_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const r of settingsRows ?? []) settings[r.key] = r.value ?? ''
  const defaultBillable = parseFloat(settings.default_billable_rate || '0') || 0
  const defaultCost = parseFloat(settings.default_cost_rate || '0') || 0

  // Recent auto-invoicing runs (for the activity panel)
  const { data: autoRuns } = await supabase
    .from('auto_invoice_runs')
    .select('id, ran_at, trigger, created_count, details, errors')
    .order('ran_at', { ascending: false })
    .limit(8)

  // Reference data
  const { data: companies } = await supabase.from('companies').select('id, name, status, billable_rate, xero_contact_id, auto_invoice')
  const { data: users } = await supabase.from('users').select('id, cost_rate')
  const { data: projects } = await supabase.from('projects').select('id, company_id')
  const { data: charges } = await supabase
    .from('recurring_charges').select('*') // all (active + paused) so paused charges stay manageable
  const { data: logs } = await supabase
    .from('time_logs')
    .select('project_id, user_id, duration_minutes, is_billable, logged_at')
    .gte('logged_at', period.start)
    .lte('logged_at', period.end)

  const costByUser = new Map<string, number>()
  for (const u of users ?? []) costByUser.set(u.id, u.cost_rate != null ? Number(u.cost_rate) : defaultCost)
  const companyByProject = new Map<string, string>()
  for (const p of projects ?? []) companyByProject.set(p.id, p.company_id)

  // Recurring due this month, grouped by company
  const recurringByCompany = new Map<string, number>()
  const chargesByCompany: Record<string, RecurringCharge[]> = {}
  for (const c of (charges ?? []) as RecurringCharge[]) {
    (chargesByCompany[c.company_id] ??= []).push(c)
    if (!c.active) continue // paused: shown in the list, but not counted toward what's due
    const started = c.start_date <= period.end
    const dueThisMonth = c.cadence === 'monthly'
      ? started
      : started && Number(c.start_date.slice(5, 7)) === period.m // yearly: matching month
    if (dueThisMonth) {
      recurringByCompany.set(c.company_id, (recurringByCompany.get(c.company_id) ?? 0) + Number(c.amount))
    }
  }

  // Time aggregation, grouped by company
  const billableMinByCompany = new Map<string, number>()
  const costByCompany = new Map<string, number>()
  for (const l of logs ?? []) {
    const companyId = l.project_id ? companyByProject.get(l.project_id) : undefined
    if (!companyId) continue
    const mins = l.duration_minutes ?? 0
    const cost = (mins / 60) * (costByUser.get(l.user_id) ?? defaultCost)
    costByCompany.set(companyId, (costByCompany.get(companyId) ?? 0) + cost)
    if (l.is_billable) billableMinByCompany.set(companyId, (billableMinByCompany.get(companyId) ?? 0) + mins)
  }

  // Build rows for relevant companies (active clients, or any with charges/time this month)
  const relevant = new Set<string>()
  for (const c of companies ?? []) if (c.status === 'active_client') relevant.add(c.id)
  for (const id of recurringByCompany.keys()) relevant.add(id)
  for (const id of Object.keys(chargesByCompany)) relevant.add(id) // incl. paused, so they stay manageable
  for (const id of billableMinByCompany.keys()) relevant.add(id)
  for (const id of costByCompany.keys()) relevant.add(id)

  const companyMap = new Map((companies ?? []).map(c => [c.id, c]))

  const rows: BillingRow[] = [...relevant].map(id => {
    const c = companyMap.get(id)
    const billableRate = c?.billable_rate != null ? Number(c.billable_rate) : defaultBillable
    const recurring = recurringByCompany.get(id) ?? 0
    const billableMins = billableMinByCompany.get(id) ?? 0
    const billableAmount = (billableMins / 60) * billableRate
    const internalCost = costByCompany.get(id) ?? 0
    return {
      companyId: id,
      name: c?.name ?? 'Unknown',
      recurring,
      billableMinutes: billableMins,
      billableRate,
      billableRateOverridden: c?.billable_rate != null,
      billableAmount,
      amountToInvoice: recurring + billableAmount,
      internalCost,
      xeroLinked: c?.xero_contact_id != null,
      autoInvoice: c?.auto_invoice ?? false,
    }
  }).sort((a, b) => b.amountToInvoice - a.amountToInvoice)

  const totals = rows.reduce((t, r) => ({
    invoice: t.invoice + r.amountToInvoice,
    cost: t.cost + r.internalCost,
  }), { invoice: 0, cost: 0 })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <p className="text-gray-500 mt-1">What to invoice each client, and internal cost — {period.label}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/invoices?month=${period.prev}`} className="border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600">← Prev</Link>
          <span className="text-sm font-medium text-gray-700 w-32 text-center">{period.label}</span>
          <Link href={`/invoices?month=${period.next}`} className="border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600">Next →</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">To invoice ({period.label})</div>
          <div className="text-xl font-bold text-gray-900">${totals.invoice.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">Internal cost</div>
          <div className="text-xl font-bold text-gray-900">${totals.cost.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">Est. margin</div>
          <div className="text-xl font-bold text-gray-900">${(totals.invoice - totals.cost).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      {autoRuns && autoRuns.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Recent auto-invoicing</h2>
          <div className="space-y-3">
            {autoRuns.map(run => (
              <div key={run.id} className="text-sm border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gray-700 font-medium">
                    {new Date(run.ran_at).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{run.trigger}</span>
                  <span className="text-gray-400 text-xs">{run.created_count} draft{run.created_count === 1 ? '' : 's'}</span>
                </div>
                {Array.isArray(run.details) && run.details.length > 0 && (
                  <div className="flex flex-col gap-0.5 pl-1">
                    {run.details.map((d: { company?: string; total?: number; invoiceId?: string; number?: string }, i: number) => (
                      <div key={i} className="text-xs text-gray-600 flex items-center gap-2">
                        <span>{d.company}</span>
                        <span className="text-gray-400">${Number(d.total ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        {d.invoiceId && (
                          <a href={`https://go.xero.com/app/invoicing/edit/${d.invoiceId}`} target="_blank" rel="noopener noreferrer" className="text-[#E8611A] hover:underline">
                            {d.number || 'Open in Xero'} →
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {Array.isArray(run.errors) && run.errors.length > 0 && (
                  <div className="flex flex-col gap-0.5 pl-1 mt-1">
                    {run.errors.map((e: { company?: string; error?: string }, i: number) => (
                      <div key={i} className="text-xs text-red-600">{e.company}: {e.error}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <BillingTable
        rows={rows}
        chargesByCompany={chargesByCompany}
        defaultBillableRate={defaultBillable}
        month={period.ym}
      />

      <p className="text-xs text-gray-400 mt-3">
        Billable hours use each client&apos;s rate (or the default). Internal cost uses each
        person&apos;s cost rate. Set rates in Settings. Pushing these to Xero as invoices
        comes in a later phase.
      </p>
    </div>
  )
}
