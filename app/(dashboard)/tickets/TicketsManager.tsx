'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createTicket, setTicketStatus, setTicketPriority, deleteTicket } from '@/app/actions/tickets'

export interface TicketRow {
  id: string
  subject: string
  description: string | null
  priority: string
  status: string
  created_at: string | null
  company_id: string
  company_name: string
}
export interface TicketCompany { id: string; name: string }

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-700' },
  awaiting_client: { label: 'Awaiting client', cls: 'bg-purple-100 text-purple-700' },
  resolved: { label: 'Resolved', cls: 'bg-green-100 text-green-700' },
  closed: { label: 'Closed', cls: 'bg-gray-100 text-gray-500' },
}
const PRIORITY: Record<string, { label: string; cls: string }> = {
  low: { label: 'Low', cls: 'text-gray-500' },
  medium: { label: 'Medium', cls: 'text-gray-700' },
  high: { label: 'High', cls: 'text-orange-600' },
  critical: { label: 'Critical', cls: 'text-red-600 font-semibold' },
}
const STATUS_KEYS = ['open', 'in_progress', 'awaiting_client', 'resolved', 'closed']
const PRIORITY_KEYS = ['low', 'medium', 'high', 'critical']
const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  ...STATUS_KEYS.map(k => ({ value: k, label: STATUS[k].label })),
]

function fmt(d: string | null) { return d ? new Date(d).toLocaleDateString('en-AU') : '' }

export default function TicketsManager({ tickets, companies }: { tickets: TicketRow[]; companies: TicketCompany[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState('active')
  const [showNew, setShowNew] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const shown = tickets.filter(t => {
    if (filter === 'all') return true
    if (filter === 'active') return t.status !== 'resolved' && t.status !== 'closed'
    return t.status === filter
  })

  const inputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#254DA5]'

  function submitNew(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await createTicket(formData)
      if (res.error) { setError(res.error); return }
      setShowNew(false)
      router.refresh()
    })
  }
  function changeStatus(id: string, status: string) {
    startTransition(async () => { await setTicketStatus(id, status); router.refresh() })
  }
  function changePriority(id: string, priority: string) {
    startTransition(async () => { await setTicketPriority(id, priority); router.refresh() })
  }
  function remove(id: string) {
    if (!confirm('Delete this ticket?')) return
    startTransition(async () => { await deleteTicket(id); router.refresh() })
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
          <p className="text-gray-500 mt-1">Client-raised issues — triage, prioritise and track to resolution.</p>
        </div>
        <button onClick={() => { setShowNew(v => !v); setError(null) }} className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
          {showNew ? 'Close' : '+ New ticket'}
        </button>
      </div>

      {/* New ticket form */}
      {showNew && (
        <form action={submitNew} className="bg-white rounded-xl border border-gray-200 p-5 mb-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Client</label>
              <select name="company_id" className="input w-full text-sm" defaultValue="">
                <option value="" disabled>{companies.length ? '— choose a client —' : 'No clients yet'}</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <select name="priority" className="input w-full text-sm" defaultValue="medium">
                {PRIORITY_KEYS.map(k => <option key={k} value={k}>{PRIORITY[k].label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
            <input name="subject" placeholder="Short summary of the issue" className="input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea name="description" rows={3} placeholder="What's going on, steps to reproduce, anything useful." className="input w-full text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={isPending} className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
              {isPending ? 'Saving…' : 'Create ticket'}
            </button>
            <button type="button" onClick={() => setShowNew(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 mb-4">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition ${filter === f.value ? 'bg-[#254DA5] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {shown.length === 0 ? (
          <p className="text-sm text-gray-400 p-6 text-center">No tickets{filter !== 'all' ? ' in this view' : ' yet'}.</p>
        ) : shown.map(t => {
          const s = STATUS[t.status] ?? STATUS.open
          const isOpen = expanded === t.id
          return (
            <div key={t.id} className="p-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setExpanded(isOpen ? null : t.id)} className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium text-gray-900 truncate">{t.subject}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    <Link href={`/clients/${t.company_id}`} className="hover:text-[#254DA5]" onClick={e => e.stopPropagation()}>{t.company_name}</Link>
                    {t.created_at ? ` · ${fmt(t.created_at)}` : ''}
                  </div>
                </button>
                <select value={t.priority} onChange={e => changePriority(t.id, e.target.value)} disabled={isPending} className={`text-xs bg-transparent focus:outline-none ${PRIORITY[t.priority]?.cls ?? ''}`}>
                  {PRIORITY_KEYS.map(k => <option key={k} value={k}>{PRIORITY[k].label}</option>)}
                </select>
                <select value={t.status} onChange={e => changeStatus(t.id, e.target.value)} disabled={isPending} className={`text-[11px] font-medium px-2 py-1 rounded-full border-0 focus:outline-none ${s.cls}`}>
                  {STATUS_KEYS.map(k => <option key={k} value={k}>{STATUS[k].label}</option>)}
                </select>
              </div>
              {isOpen && (
                <div className="mt-3 pl-1">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{t.description || <span className="text-gray-400">No description.</span>}</p>
                  <button onClick={() => remove(t.id)} disabled={isPending} className="mt-3 text-xs text-gray-400 hover:text-red-500 disabled:opacity-50">Delete ticket</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
