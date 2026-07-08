'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveProposal, setProposalStatus, type ProposalItem } from '@/app/actions/proposals'

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
  content: { items?: ProposalItem[]; terms?: string } | null
  expires_at: string | null
  contact_id: string | null
  proposal_number: string | null
}

const money = (n: number) => `$${(Number.isFinite(n) ? n : 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const typeLabel: Record<string, string> = { fixed: 'fixed', subscription: '/mo', hourly: '/hr', custom: '' }

function servicePrice(s: BuilderService): number {
  if (s.pricing_type === 'fixed') return Number(s.fixed_price) || 0
  if (s.pricing_type === 'subscription') return Number(s.monthly_fee) || 0
  if (s.pricing_type === 'hourly') return Number(s.hourly_rate) || 0
  return 0
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
  const [title, setTitle] = useState(proposal?.title ?? '')
  const [contactId, setContactId] = useState(proposal?.contact_id ?? '')
  const [items, setItems] = useState<ProposalItem[]>(proposal?.content?.items ?? [])
  const [terms, setTerms] = useState(proposal?.content?.terms ?? '')
  const [expiresAt, setExpiresAt] = useState(proposal?.expires_at ? proposal.expires_at.slice(0, 10) : '')
  const [pick, setPick] = useState('')
  const [error, setError] = useState<string | null>(null)

  const total = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)

  function addFromCatalogue() {
    const s = services.find(x => x.id === pick)
    if (!s) return
    setItems(prev => [...prev, { description: s.name, pricing_type: s.pricing_type, amount: servicePrice(s) }])
    setPick('')
  }
  function addCustom() {
    setItems(prev => [...prev, { description: '', pricing_type: 'custom', amount: 0 }])
  }
  function updateItem(i: number, patch: Partial<ProposalItem>) {
    setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }
  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function save(markSent = false) {
    setError(null)
    if (!title.trim()) { setError('Give the proposal a title.'); return }
    startTransition(async () => {
      const res = await saveProposal({ id: proposal?.id, company_id: companyId, title, items, terms, expires_at: expiresAt || null, contact_id: contactId || null })
      if (res.error) { setError(res.error); return }
      if (markSent && res.id) {
        await setProposalStatus(res.id, 'sent', companyId)
      }
      router.push(`/clients/${companyId}`)
      router.refresh()
    })
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Link href={`/clients/${companyId}`} className="text-sm text-gray-400 hover:text-gray-600">← {companyName}</Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-2xl font-bold text-gray-900">{proposal ? 'Edit proposal' : 'New proposal'}</h1>
          {proposal?.proposal_number && (
            <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{proposal.proposal_number}</span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Website redesign proposal" className="input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Proposal to (contact)</label>
            <select value={contactId} onChange={e => setContactId(e.target.value)} className="input w-full text-sm">
              <option value="">{contacts.length ? '— choose a contact —' : 'No contacts on this client yet'}</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{contactName(c)}{c.is_primary ? ' (primary)' : ''}</option>)}
            </select>
          </div>
        </div>

        {/* Line items */}
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Line items</div>
          {items.length === 0 && <p className="text-sm text-gray-400 mb-2">No items yet — add from your catalogue or a custom line.</p>}
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={it.description}
                  onChange={e => updateItem(i, { description: e.target.value })}
                  placeholder="Description"
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#254DA5]"
                />
                <span className="text-xs text-gray-400 w-8 text-right shrink-0">{typeLabel[it.pricing_type] ?? ''}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    value={it.amount}
                    onChange={e => updateItem(i, { amount: Number(e.target.value) || 0 })}
                    type="number" step="0.01" min="0"
                    className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 text-right focus:outline-none focus:border-[#254DA5]"
                  />
                </div>
                <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 text-xs shrink-0">✕</button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {services.length > 0 && (
              <>
                <select value={pick} onChange={e => setPick(e.target.value)} className="input text-sm w-56">
                  <option value="">Add from catalogue…</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name} — {money(servicePrice(s))}{typeLabel[s.pricing_type] ? ` ${typeLabel[s.pricing_type]}` : ''}</option>)}
                </select>
                <button onClick={addFromCatalogue} disabled={!pick} className="text-xs font-semibold text-[#254DA5] hover:underline disabled:opacity-40">Add</button>
                <span className="text-gray-300">·</span>
              </>
            )}
            <button onClick={addCustom} className="text-xs font-semibold text-[#254DA5] hover:underline">+ Custom line</button>
          </div>

          <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
            <div className="text-sm text-gray-500">Total: <span className="font-semibold text-gray-900">{money(total)}</span></div>
          </div>
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
