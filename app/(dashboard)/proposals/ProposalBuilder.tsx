'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveProposal, setProposalStatus } from '@/app/actions/proposals'
import {
  normaliseContent, computeTotals, summaryText, money, lineAmount, CYCLES,
  type ProposalLine, type ProposalTax, type BillingCycle,
} from '@/lib/proposalPricing'

export interface BuilderService {
  id: string
  name: string
  pricing_type: string
  fixed_price: number | null
  monthly_fee: number | null
  hourly_rate: number | null
}
export interface BuilderContact { id: string; first_name: string | null; last_name: string | null; is_primary?: boolean | null }
export interface BuilderProposal {
  id: string
  title: string
  content: unknown
  expires_at: string | null
  contact_id: string | null
  proposal_number: string | null
}

const KINDS = [
  { value: 'package', label: 'Package' },
  { value: 'add_on', label: 'Add-on' },
  { value: 'item', label: 'Item' },
]

function servicePrice(s: BuilderService): number {
  if (s.pricing_type === 'fixed') return Number(s.fixed_price) || 0
  if (s.pricing_type === 'subscription') return Number(s.monthly_fee) || 0
  if (s.pricing_type === 'hourly') return Number(s.hourly_rate) || 0
  return 0
}
function serviceCycle(s: BuilderService): BillingCycle {
  return s.pricing_type === 'subscription' ? 'monthly' : 'one_off'
}
function contactName(c: BuilderContact) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed contact'
}

export default function ProposalBuilder({
  companyId, companyName, services, contacts, proposal,
}: {
  companyId: string
  companyName: string
  services: BuilderService[]
  contacts: BuilderContact[]
  proposal?: BuilderProposal
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const initial = normaliseContent(proposal?.content)

  const [title, setTitle] = useState(proposal?.title ?? '')
  const [contactId, setContactId] = useState(proposal?.contact_id ?? '')
  const [lines, setLines] = useState<ProposalLine[]>(initial.lines)
  const [taxes, setTaxes] = useState<ProposalTax[]>(initial.taxes)
  const [terms, setTerms] = useState(initial.terms)
  const [expiresAt, setExpiresAt] = useState(proposal?.expires_at ? proposal.expires_at.slice(0, 10) : '')
  const [pick, setPick] = useState('')
  const [error, setError] = useState<string | null>(null)

  const totals = computeTotals({ lines, taxes, terms, currency: 'AUD' })

  function addFromCatalogue() {
    const s = services.find(x => x.id === pick)
    if (!s) return
    setLines(prev => [...prev, { kind: 'package', description: s.name, quantity: 1, billing_cycle: serviceCycle(s), unit_price: servicePrice(s) }])
    setPick('')
  }
  function addLine() {
    setLines(prev => [...prev, { kind: 'item', description: '', quantity: 1, billing_cycle: 'one_off', unit_price: 0 }])
  }
  function updateLine(i: number, patch: Partial<ProposalLine>) {
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function removeLine(i: number) { setLines(prev => prev.filter((_, idx) => idx !== i)) }

  function addTax() { setTaxes(prev => [...prev, { label: 'GST', rate: 10, inclusive: false }]) }
  function updateTax(i: number, patch: Partial<ProposalTax>) {
    setTaxes(prev => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }
  function removeTax(i: number) { setTaxes(prev => prev.filter((_, idx) => idx !== i)) }

  function save(markSent = false) {
    setError(null)
    if (!title.trim()) { setError('Give the proposal a title.'); return }
    startTransition(async () => {
      const res = await saveProposal({ id: proposal?.id, company_id: companyId, title, lines, taxes, terms, expires_at: expiresAt || null, contact_id: contactId || null })
      if (res.error) { setError(res.error); return }
      if (markSent && res.id) await setProposalStatus(res.id, 'sent', companyId)
      router.push(`/clients/${companyId}`)
      router.refresh()
    })
  }

  const inputCls = 'border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#254DA5]'

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <Link href={`/clients/${companyId}`} className="text-sm text-gray-400 hover:text-gray-600">← {companyName}</Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-2xl font-bold text-gray-900">{proposal ? 'Edit proposal' : 'New proposal'}</h1>
          {proposal?.proposal_number && (
            <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{proposal.proposal_number}</span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {/* Cover */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Done-For-You Marketing Program" className="input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Proposal to (contact)</label>
            <select value={contactId} onChange={e => setContactId(e.target.value)} className="input w-full text-sm">
              <option value="">{contacts.length ? '— choose a contact —' : 'No contacts on this client yet'}</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{contactName(c)}{c.is_primary ? ' (primary)' : ''}</option>)}
            </select>
          </div>
        </div>

        {/* Offerings / lines */}
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Offerings</div>
          {lines.length === 0 && <p className="text-sm text-gray-400 mb-2">No lines yet — add from your catalogue or a custom line.</p>}
          {lines.length > 0 && (
            <div className="space-y-2">
              <div className="hidden md:grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wide text-gray-400 px-1">
                <div className="col-span-5">Description</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-1 text-right">Qty</div>
                <div className="col-span-2">Billing</div>
                <div className="col-span-2 text-right">Unit price</div>
              </div>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input value={l.description} onChange={e => updateLine(i, { description: e.target.value })} placeholder="Description" className={`col-span-12 md:col-span-5 ${inputCls}`} />
                  <select value={l.kind} onChange={e => updateLine(i, { kind: e.target.value })} className={`col-span-4 md:col-span-2 ${inputCls}`}>
                    {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                  <input type="number" min="0" step="1" value={l.quantity} onChange={e => updateLine(i, { quantity: Number(e.target.value) || 0 })} className={`col-span-2 md:col-span-1 text-right ${inputCls}`} />
                  <select value={l.billing_cycle} onChange={e => updateLine(i, { billing_cycle: e.target.value as BillingCycle })} className={`col-span-4 md:col-span-2 ${inputCls}`}>
                    {CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <div className="col-span-2 md:col-span-2 flex items-center justify-end gap-1">
                    <span className="text-sm text-gray-400">$</span>
                    <input type="number" min="0" step="0.01" value={l.unit_price} onChange={e => updateLine(i, { unit_price: Number(e.target.value) || 0 })} className={`w-full text-right ${inputCls}`} />
                  </div>
                  <button onClick={() => removeLine(i)} className="col-span-12 md:hidden text-left text-xs text-gray-400 hover:text-red-500">Remove line</button>
                  <button onClick={() => removeLine(i)} className="hidden md:block text-gray-300 hover:text-red-500 text-xs">✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {services.length > 0 && (
              <>
                <select value={pick} onChange={e => setPick(e.target.value)} className="input text-sm w-64">
                  <option value="">Add from catalogue…</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name} — {money(servicePrice(s))}{serviceCycle(s) === 'monthly' ? '/mo' : ''}</option>)}
                </select>
                <button onClick={addFromCatalogue} disabled={!pick} className="text-xs font-semibold text-[#254DA5] hover:underline disabled:opacity-40">Add</button>
                <span className="text-gray-300">·</span>
              </>
            )}
            <button onClick={addLine} className="text-xs font-semibold text-[#254DA5] hover:underline">+ Custom line</button>
          </div>
        </div>

        {/* Taxes */}
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Taxes</div>
          {taxes.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 mb-2">
              <input value={t.label} onChange={e => updateTax(i, { label: e.target.value })} placeholder="e.g. GST" className={`w-40 ${inputCls}`} />
              <div className="flex items-center gap-1">
                <input type="number" min="0" step="0.01" value={t.rate} onChange={e => updateTax(i, { rate: Number(e.target.value) || 0 })} className={`w-20 text-right ${inputCls}`} />
                <span className="text-sm text-gray-400">%</span>
              </div>
              <select value={t.inclusive ? 'inc' : 'exc'} onChange={e => updateTax(i, { inclusive: e.target.value === 'inc' })} className={inputCls}>
                <option value="exc">Exclusive (added on top)</option>
                <option value="inc">Inclusive (already in prices)</option>
              </select>
              <button onClick={() => removeTax(i)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
            </div>
          ))}
          <button onClick={addTax} className="text-xs font-semibold text-[#254DA5] hover:underline">+ Add tax (GST 10%)</button>
        </div>

        {/* Totals */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
          <div className="text-sm text-gray-500 space-y-1">
            {totals.once > 0 && <div className="flex justify-between"><span>One-off (inc tax)</span><span className="font-medium text-gray-900">{money(totals.once)}</span></div>}
            {totals.monthly > 0 && <div className="flex justify-between"><span>Monthly (inc tax)</span><span className="font-medium text-gray-900">{money(totals.monthly)}/mo</span></div>}
            {totals.quarterly > 0 && <div className="flex justify-between"><span>Quarterly (inc tax)</span><span className="font-medium text-gray-900">{money(totals.quarterly)}/qtr</span></div>}
            {totals.annually > 0 && <div className="flex justify-between"><span>Annually (inc tax)</span><span className="font-medium text-gray-900">{money(totals.annually)}/yr</span></div>}
            {totals.tax > 0 && <div className="flex justify-between text-xs text-gray-400"><span>Tax included</span><span>{money(totals.tax)}</span></div>}
          </div>
          <div className="border-t border-gray-200 mt-2 pt-2 text-sm font-semibold text-gray-900">{summaryText(totals)}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Valid until</label>
            <input value={expiresAt} onChange={e => setExpiresAt(e.target.value)} type="date" className="input w-full text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Terms / notes</label>
          <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={3} placeholder="Scope, terms, anything the client should see." className="input w-full text-sm" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-2 pt-2">
          <button onClick={() => save(false)} disabled={isPending} className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
            {isPending ? 'Saving…' : 'Save draft'}
          </button>
          <button onClick={() => save(true)} disabled={isPending} className="border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
            Save &amp; mark sent
          </button>
          <Link href={`/clients/${companyId}`} className="text-sm text-gray-500 hover:text-gray-700 ml-1">Cancel</Link>
        </div>
      </div>
    </div>
  )
}
