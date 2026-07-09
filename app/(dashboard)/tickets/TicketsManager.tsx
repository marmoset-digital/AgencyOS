'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createTicket, setTicketStatus, setTicketPriority, setTicketAssignee } from '@/app/actions/tickets'
import { siteOrigin } from '@/lib/publicUrl'

export interface TicketRow {
  id: string
  subject: string
  priority: string
  status: string
  created_at: string | null
  company_id: string
  company_name: string
  assignee_id: string | null
  assignee_name: string | null
}
export interface TicketCompany { id: string; name: string; support_token: string | null }
export interface TicketUser { id: string; full_name: string | null; email: string | null }
export interface TicketProject { id: string; name: string; company_id: string }

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
function userName(u: TicketUser) { return u.full_name || u.email || 'Unnamed' }

export default function TicketsManager({ tickets, companies, users, projects }: {
  tickets: TicketRow[]; companies: TicketCompany[]; users: TicketUser[]; projects: TicketProject[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState('active')
  const [showNew, setShowNew] = useState(false)
  const [showLinks, setShowLinks] = useState(false)
  const [linkFilter, setLinkFilter] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [newCompany, setNewCompany] = useState('')
  const [error, setError] = useState<string | null>(null)

  const supportLink = (tok: string) => `${siteOrigin()}/support/${tok}`
  function copyLink(tok: string) {
    navigator.clipboard?.writeText(supportLink(tok))
    setCopied(tok)
    setTimeout(() => setCopied(c => (c === tok ? null : c)), 1500)
  }
  const linkCompanies = companies.filter(c => c.support_token && c.name.toLowerCase().includes(linkFilter.toLowerCase()))

  const shown = tickets.filter(t => {
    if (filter === 'all') return true
    if (filter === 'active') return t.status !== 'resolved' && t.status !== 'closed'
    return t.status === filter
  })
  const formProjects = projects.filter(p => p.company_id === newCompany)

  function submitNew(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await createTicket(formData)
      if (res.error) { setError(res.error); return }
      setShowNew(false); setNewCompany('')
      router.refresh()
    })
  }
  const change = (fn: () => Promise<unknown>) => startTransition(async () => { await fn(); router.refresh() })

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
          <p className="text-gray-500 mt-1">Client-raised issues — triage, assign, prioritise and track to resolution.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowLinks(v => !v)} className="text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition">
            Client support links
          </button>
          <button onClick={() => { setShowNew(v => !v); setError(null) }} className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
            {showNew ? 'Close' : '+ New ticket'}
          </button>
        </div>
      </div>

      {/* Client support links — copy a client's no-login /support link to send them */}
      {showLinks && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-gray-900">Client support links</h2>
              <p className="text-xs text-gray-400 mt-0.5">Each client gets a private link to raise and track tickets — no login required. Send it to your client.</p>
            </div>
            <input value={linkFilter} onChange={e => setLinkFilter(e.target.value)} placeholder="Filter clients…" className="input text-sm w-48" />
          </div>
          <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
            {linkCompanies.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No clients{linkFilter ? ' match' : ''}.</p>
            ) : linkCompanies.map(c => (
              <div key={c.id} className="flex items-center gap-3 py-2">
                <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">{c.name}</span>
                <a href={supportLink(c.support_token!)} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-gray-800">Open ↗</a>
                <button onClick={() => copyLink(c.support_token!)} className="text-xs font-semibold text-[#254DA5] hover:underline">{copied === c.support_token ? 'Copied!' : 'Copy link'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showNew && (
        <form action={submitNew} className="bg-white rounded-xl border border-gray-200 p-5 mb-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Client</label>
              <select name="company_id" value={newCompany} onChange={e => setNewCompany(e.target.value)} className="input w-full text-sm">
                <option value="">{companies.length ? '— choose a client —' : 'No clients yet'}</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <select name="priority" className="input w-full text-sm" defaultValue="medium">
                {PRIORITY_KEYS.map(k => <option key={k} value={k}>{PRIORITY[k].label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Assignee <span className="text-gray-400 font-normal">(optional)</span></label>
              <select name="assignee_id" className="input w-full text-sm" defaultValue="">
                <option value="">— unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{userName(u)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Project <span className="text-gray-400 font-normal">(optional)</span></label>
              <select name="project_id" className="input w-full text-sm" defaultValue="" disabled={!newCompany}>
                <option value="">{newCompany ? '— none —' : 'Choose a client first'}</option>
                {formProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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

      <div className="flex flex-wrap gap-1 mb-4">
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition ${filter === f.value ? 'bg-[#254DA5] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {shown.length === 0 ? (
          <p className="text-sm text-gray-400 p-6 text-center">No tickets{filter !== 'all' ? ' in this view' : ' yet'}.</p>
        ) : shown.map(t => {
          const s = STATUS[t.status] ?? STATUS.open
          return (
            <div key={t.id} className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Link href={`/tickets/${t.id}`} className="text-sm font-medium text-gray-900 hover:text-[#254DA5] truncate block">{t.subject}</Link>
                <div className="text-xs text-gray-400 mt-0.5">
                  <Link href={`/clients/${t.company_id}`} className="hover:text-[#254DA5]">{t.company_name}</Link>
                  {t.created_at ? ` · ${fmt(t.created_at)}` : ''}
                  {t.assignee_name ? ` · ${t.assignee_name}` : ' · unassigned'}
                </div>
              </div>
              <select value={t.assignee_id ?? ''} onChange={e => change(() => setTicketAssignee(t.id, e.target.value || null))} disabled={isPending} className="text-xs text-gray-600 bg-transparent focus:outline-none max-w-[8rem]">
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{userName(u)}</option>)}
              </select>
              <select value={t.priority} onChange={e => change(() => setTicketPriority(t.id, e.target.value))} disabled={isPending} className={`text-xs bg-transparent focus:outline-none ${PRIORITY[t.priority]?.cls ?? ''}`}>
                {PRIORITY_KEYS.map(k => <option key={k} value={k}>{PRIORITY[k].label}</option>)}
              </select>
              <select value={t.status} onChange={e => change(() => setTicketStatus(t.id, e.target.value))} disabled={isPending} className={`text-[11px] font-medium px-2 py-1 rounded-full border-0 focus:outline-none ${s.cls}`}>
                {STATUS_KEYS.map(k => <option key={k} value={k}>{STATUS[k].label}</option>)}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
