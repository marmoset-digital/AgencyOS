'use client'

import { useState, useTransition, Fragment } from 'react'
import { updateCompanyBillableRate, addRecurringCharge, toggleRecurringCharge, deleteRecurringCharge } from '@/app/actions/billing'
import { createXeroDraftInvoice } from '@/app/actions/xero'

export interface RecurringCharge {
  id: string
  company_id: string
  description: string
  amount: number
  cadence: 'monthly' | 'yearly'
  start_date: string
  active: boolean
}

export interface BillingRow {
  companyId: string
  name: string
  recurring: number
  billableMinutes: number
  billableRate: number
  billableRateOverridden: boolean
  billableAmount: number
  amountToInvoice: number
  internalCost: number
  xeroLinked: boolean
}

function money(n: number) {
  return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function hrs(mins: number) {
  return (mins / 60).toLocaleString('en-AU', { maximumFractionDigits: 2 }) + 'h'
}

interface Props {
  rows: BillingRow[]
  chargesByCompany: Record<string, RecurringCharge[]>
  defaultBillableRate: number
  month: string
}

interface PushResult { ok: boolean; msg: string; invoiceId?: string }

export default function BillingTable({ rows, chargesByCompany, defaultBillableRate, month }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pushing, setPushing] = useState<string | null>(null)
  const [pushResult, setPushResult] = useState<Record<string, PushResult>>({})

  function createDraft(companyId: string) {
    setPushing(companyId)
    setPushResult(prev => { const n = { ...prev }; delete n[companyId]; return n })
    startTransition(async () => {
      const r = await createXeroDraftInvoice(companyId, month)
      setPushing(null)
      if (r?.error) setPushResult(prev => ({ ...prev, [companyId]: { ok: false, msg: r.error! } }))
      else setPushResult(prev => ({ ...prev, [companyId]: {
        ok: true,
        msg: `Draft created${r?.total != null ? ` — ${money(r.total)} (inc GST)` : ''}.`,
        invoiceId: r?.invoiceId,
      } }))
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {rows.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          No active clients, recurring charges, or billable time this month.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left">
              <th className="px-5 py-3 font-medium text-gray-500">Client</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Recurring</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Billable</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Billable $</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">To invoice</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-right">Internal cost</th>
              <th className="px-4 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const charges = chargesByCompany[row.companyId] ?? []
              const isOpen = expanded === row.companyId
              return (
                <Fragment key={row.companyId}>
                  <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition cursor-pointer" onClick={() => setExpanded(isOpen ? null : row.companyId)}>
                    <td className="px-5 py-3.5 font-medium text-gray-900">{row.name}</td>
                    <td className="px-4 py-3.5 text-right text-gray-700">{money(row.recurring)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500">{hrs(row.billableMinutes)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-700">{money(row.billableAmount)}</td>
                    <td className="px-4 py-3.5 text-right font-semibold text-gray-900">{money(row.amountToInvoice)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-500">{money(row.internalCost)}</td>
                    <td className="px-4 py-3.5 text-gray-400 text-xs">{isOpen ? '▾' : '▸'}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 space-y-5">
                          {/* Create draft invoice in Xero */}
                          <div>
                            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Invoice</div>
                            {row.xeroLinked ? (
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => createDraft(row.companyId)}
                                  disabled={isPending || pushing === row.companyId || row.amountToInvoice <= 0}
                                  className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50"
                                  title={row.amountToInvoice <= 0 ? 'Nothing to invoice this month' : ''}
                                >
                                  {pushing === row.companyId ? 'Creating…' : 'Create draft in Xero'}
                                </button>
                                {pushResult[row.companyId] && (
                                  <span className={`text-xs ${pushResult[row.companyId].ok ? 'text-green-700' : 'text-red-600'}`}>
                                    {pushResult[row.companyId].msg}
                                    {pushResult[row.companyId].ok && pushResult[row.companyId].invoiceId && (
                                      <a
                                        href={`https://go.xero.com/app/invoicing/edit/${pushResult[row.companyId].invoiceId}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="ml-2 font-semibold text-[#E8611A] hover:underline"
                                      >Open in Xero →</a>
                                    )}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-400">Link this client to a Xero contact (in Settings) to create invoices.</div>
                            )}
                          </div>

                          {/* Billable rate */}
                          <div>
                            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Billable rate</div>
                            <form
                              action={async (fd) => { await updateCompanyBillableRate(row.companyId, (fd.get('billable_rate') as string) ?? '') }}
                              className="flex items-end gap-2"
                            >
                              <div>
                                <input
                                  name="billable_rate"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  defaultValue={row.billableRateOverridden ? row.billableRate : ''}
                                  placeholder={`Default ${money(defaultBillableRate)}/hr`}
                                  className="input w-52 text-sm"
                                />
                              </div>
                              <button type="submit" className="text-xs font-semibold text-[#E8611A] hover:text-[#d45516]">Save rate</button>
                              <span className="text-xs text-gray-400 ml-1">
                                Currently {money(row.billableRate)}/hr {row.billableRateOverridden ? '(client override)' : '(default)'}
                              </span>
                            </form>
                          </div>

                          {/* Recurring charges */}
                          <div>
                            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Recurring charges</div>
                            {charges.length === 0 && <div className="text-xs text-gray-400 mb-2">No recurring charges.</div>}
                            <div className="flex flex-col gap-1.5 mb-3">
                              {charges.map(c => (
                                <div key={c.id} className="flex items-center gap-3 text-sm group/rc">
                                  <span className="text-gray-800 w-64">{c.description}</span>
                                  <span className="text-gray-700 w-24 text-right">{money(Number(c.amount))}</span>
                                  <span className="text-gray-400 text-xs w-20">/{c.cadence === 'monthly' ? 'month' : 'year'}</span>
                                  <button
                                    onClick={() => startTransition(async () => { await toggleRecurringCharge(c.id, !c.active) })}
                                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                                  >
                                    {c.active ? 'Active' : 'Paused'}
                                  </button>
                                  <button
                                    onClick={() => { if (confirm('Delete this charge?')) startTransition(async () => { await deleteRecurringCharge(c.id) }) }}
                                    className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover/rc:opacity-100 transition"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                            <form
                              action={async (fd) => { fd.append('company_id', row.companyId); await addRecurringCharge(fd) }}
                              className="flex flex-wrap items-end gap-2"
                            >
                              <input name="description" required placeholder="Description (e.g. Gold retainer)" className="input text-sm w-64" />
                              <input name="amount" type="number" step="0.01" min="0" required placeholder="Amount" className="input text-sm w-28" />
                              <select name="cadence" className="input text-sm w-32">
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                              </select>
                              <input name="start_date" type="date" className="input text-sm w-40" title="Start date (yearly: sets the billing month)" />
                              <button type="submit" disabled={isPending} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50">
                                + Add charge
                              </button>
                            </form>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
