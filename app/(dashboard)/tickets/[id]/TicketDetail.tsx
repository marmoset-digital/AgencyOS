'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { listTicketAttachmentsTeam, type Attachment } from '@/app/actions/attachments'
import { formatBytes } from '@/lib/attachmentsClient'

// Attachments belonging to one message (the original request, or a single reply).
function AttList({ items }: { items: Attachment[] }) {
  if (items.length === 0) return null
  return (
    <ul className="mt-2 space-y-1">
      {items.map(a => (
        <li key={a.id} className="flex items-center gap-2 text-sm">
          <span aria-hidden="true">{a.type?.startsWith('image/') ? '🖼️' : '📎'}</span>
          {a.url
            ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-[#254DA5] hover:underline break-all">{a.name}</a>
            : <span className="text-gray-500 break-all">{a.name}</span>}
          {a.size ? <span className="text-xs text-gray-400">{formatBytes(a.size)}</span> : null}
        </li>
      ))}
    </ul>
  )
}
import { setTicketStatus, setTicketPriority, setTicketAssignee, setTicketProject, addTicketReply, deleteTicket } from '@/app/actions/tickets'

export interface DetailTicket {
  id: string
  subject: string
  description: string | null
  priority: string
  status: string
  created_at: string | null
  company_id: string
  company_name: string
  contact_name: string | null
  project_id: string | null
  assignee_id: string | null
}
export interface DetailReply { id: string; content: string; author_type: string; created_at: string | null; author_name: string }
export interface DetailUser { id: string; full_name: string | null; email: string | null }
export interface DetailProject { id: string; name: string; company_id: string }

const STATUS_KEYS = ['open', 'in_progress', 'awaiting_client', 'resolved', 'closed']
const STATUS_LABEL: Record<string, string> = { open: 'Open', in_progress: 'In progress', awaiting_client: 'Awaiting client', resolved: 'Resolved', closed: 'Closed' }
const PRIORITY_KEYS = ['low', 'medium', 'high', 'critical']
const PRIORITY_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }

function fmt(d: string | null) { return d ? new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '' }
function userName(u: DetailUser) { return u.full_name || u.email || 'Unnamed' }

export default function TicketDetail({ ticket, replies, users, projects }: {
  ticket: DetailTicket; replies: DetailReply[]; users: DetailUser[]; projects: DetailProject[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [reply, setReply] = useState('')
  const [atts, setAtts] = useState<Attachment[]>([])

  const loadAtts = useCallback(async () => {
    const res = await listTicketAttachmentsTeam(ticket.id)
    if ('attachments' in res && res.attachments) setAtts(res.attachments)
  }, [ticket.id])

  useEffect(() => { void loadAtts() }, [loadAtts])

  // reply_id null = attached when the ticket was raised
  const attsFor = (replyId: string | null) => atts.filter(a => (a.replyId ?? null) === replyId)
  const [error, setError] = useState<string | null>(null)

  const change = (fn: () => Promise<unknown>) => startTransition(async () => { await fn(); router.refresh() })

  function sendReply() {
    setError(null)
    if (!reply.trim()) { setError('Write a reply first.'); return }
    startTransition(async () => {
      const res = await addTicketReply(ticket.id, reply)
      if (res.error) { setError(res.error); return }
      setReply('')
      router.refresh()
    })
  }
  function remove() {
    if (!confirm('Delete this ticket and its replies?')) return
    startTransition(async () => { await deleteTicket(ticket.id); router.push('/tickets'); router.refresh() })
  }

  const selectCls = 'input text-sm w-full'

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/tickets" className="text-sm text-gray-400 hover:text-gray-600">← Support Tickets</Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-1 mb-1">{ticket.subject}</h1>
      <p className="text-sm text-gray-500 mb-6">
        <Link href={`/clients/${ticket.company_id}`} className="hover:text-[#254DA5]">{ticket.company_name}</Link>
        {ticket.contact_name ? ` · raised by ${ticket.contact_name}` : ''}
        {ticket.created_at ? ` · ${fmt(ticket.created_at)}` : ''}
      </p>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: description + thread */}
        <div className="col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Description</div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description || <span className="text-gray-400">No description.</span>}</p>
            <AttList items={attsFor(null)} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Conversation</div>
            {replies.length === 0 ? (
              <p className="text-sm text-gray-400">No replies yet.</p>
            ) : (
              <div className="space-y-3">
                {replies.map(r => (
                  <div key={r.id} className={`rounded-xl border p-3 ${r.author_type === 'team' ? 'bg-blue-50/50 border-blue-100' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700">{r.author_name}<span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">{r.author_type}</span></span>
                      <span className="text-xs text-gray-400">{fmt(r.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.content}</p>
                    <AttList items={attsFor(r.id)} />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4">
              <textarea value={reply} onChange={e => setReply(e.target.value)} rows={3} placeholder="Write a reply to the client…" className="input w-full text-sm" />
              {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
              <button onClick={sendReply} disabled={isPending} className="mt-2 bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                {isPending ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </div>
        </div>

        {/* Right: controls */}
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Status</label>
              <select value={ticket.status} onChange={e => change(() => setTicketStatus(ticket.id, e.target.value))} disabled={isPending} className={selectCls}>
                {STATUS_KEYS.map(k => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Priority</label>
              <select value={ticket.priority} onChange={e => change(() => setTicketPriority(ticket.id, e.target.value))} disabled={isPending} className={selectCls}>
                {PRIORITY_KEYS.map(k => <option key={k} value={k}>{PRIORITY_LABEL[k]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Assignee</label>
              <select value={ticket.assignee_id ?? ''} onChange={e => change(() => setTicketAssignee(ticket.id, e.target.value || null))} disabled={isPending} className={selectCls}>
                <option value="">— unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{userName(u)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Project</label>
              <select value={ticket.project_id ?? ''} onChange={e => change(() => setTicketProject(ticket.id, e.target.value || null))} disabled={isPending} className={selectCls}>
                <option value="">— none —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={remove} disabled={isPending} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50">Delete ticket</button>
        </div>
      </div>
    </div>
  )
}
