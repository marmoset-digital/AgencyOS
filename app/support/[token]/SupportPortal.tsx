'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTicketPublic, addReplyPublic } from '@/app/actions/tickets'
import TicketAttachments from '@/components/TicketAttachments'
import { uploadFilesToTicket, ACCEPT_ATTR, ALLOWED_LABEL, MAX_UPLOAD_MB } from '@/lib/attachmentsClient'

export interface PortalReply { id: string; content: string; author_type: string; created_at: string | null; author_label: string }
export interface PortalTicket { id: string; subject: string; description: string | null; priority: string; status: string; created_at: string | null; replies: PortalReply[] }
export interface PortalContact { id: string; first_name: string | null; last_name: string | null }

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-700' },
  awaiting_client: { label: 'Awaiting your reply', cls: 'bg-purple-100 text-purple-700' },
  resolved: { label: 'Resolved', cls: 'bg-green-100 text-green-700' },
  closed: { label: 'Closed', cls: 'bg-gray-100 text-gray-500' },
}
const PRIORITY_KEYS = ['low', 'medium', 'high', 'critical']
const PRIORITY_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }

function fmt(d: string | null) { return d ? new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '' }
function contactName(c: PortalContact) { return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed' }

export default function SupportPortal({ token, companyName, tickets, contacts }: {
  token: string; companyName: string; tickets: PortalTicket[]; contacts: PortalContact[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showNew, setShowNew] = useState(tickets.length === 0)
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [contactId, setContactId] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [replyContact, setReplyContact] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [newFiles, setNewFiles] = useState<File[]>([])

  function submitNew() {
    setError(null)
    if (!subject.trim()) { setError('Please add a subject.'); return }
    startTransition(async () => {
      const res = await createTicketPublic(token, { subject, description, priority, contact_id: contactId || null })
      if (res.error) { setError(res.error); return }
      if (newFiles.length > 0 && res.id) {
        const errs = await uploadFilesToTicket(token, res.id, newFiles)
        if (errs.length > 0) {
          setError('Ticket created, but the attachment failed: ' + errs.join(' · '))
          setNewFiles([]); router.refresh(); return
        }
      }
      setSubject(''); setDescription(''); setPriority('medium'); setContactId(''); setNewFiles([]); setShowNew(false)
      router.refresh()
    })
  }
  function sendReply(ticketId: string) {
    setReplyError(null)
    if (!reply.trim()) { setReplyError('Write a reply first.'); return }
    startTransition(async () => {
      const res = await addReplyPublic(token, ticketId, reply, replyContact || null)
      if (res.error) { setReplyError(res.error); return }
      setReply(''); setReplyContact('')
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="text-[#254DA5] font-bold text-xs tracking-widest uppercase">Marmoset Digital</div>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Support</h1>
          <p className="text-sm text-gray-500">{companyName}</p>
        </div>

        {/* New request */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Raise a request</h2>
            {tickets.length > 0 && (
              <button onClick={() => { setShowNew(v => !v); setError(null) }} className="text-sm text-[#254DA5] hover:underline font-medium">
                {showNew ? 'Cancel' : '+ New request'}
              </button>
            )}
          </div>
          {showNew && (
            <div className="mt-4 space-y-3">
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject — a short summary" className="input w-full" />
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Tell us what's going on, with as much detail as you can." className="input w-full text-sm" />
              <div>
                <label className="inline-flex items-center gap-2 text-xs text-[#254DA5] hover:underline cursor-pointer">
                  <input type="file" multiple accept={ACCEPT_ATTR} onChange={e => setNewFiles(Array.from(e.target.files ?? []))} className="hidden" />
                  <span>📎 Attach files</span>
                </label>
                <p className="text-xs text-gray-400 mt-1">{ALLOWED_LABEL} · up to {MAX_UPLOAD_MB}MB each</p>
                {newFiles.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {newFiles.map((f, i) => <li key={i} className="text-xs text-gray-500">📎 {f.name}</li>)}
                  </ul>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Urgency</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} className="input w-full text-sm">
                    {PRIORITY_KEYS.map(k => <option key={k} value={k}>{PRIORITY_LABEL[k]}</option>)}
                  </select>
                </div>
                {contacts.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Your name</label>
                    <select value={contactId} onChange={e => setContactId(e.target.value)} className="input w-full text-sm">
                      <option value="">— select —</option>
                      {contacts.map(c => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button onClick={submitNew} disabled={isPending} className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                {isPending ? 'Sending…' : 'Submit request'}
              </button>
            </div>
          )}
        </div>

        {/* Existing tickets */}
        {tickets.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50">
            {tickets.map(t => {
              const s = STATUS[t.status] ?? STATUS.open
              const isOpen = expanded === t.id
              return (
                <div key={t.id} className="p-4">
                  <button onClick={() => { setExpanded(isOpen ? null : t.id); setReply(''); setReplyError(null) }} className="w-full flex items-center gap-3 text-left">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{t.subject}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{fmt(t.created_at)}</div>
                    </div>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${s.cls}`}>{s.label}</span>
                  </button>
                  {isOpen && (
                    <div className="mt-3">
                      {t.description && <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{t.description}</p>}
                      {t.replies.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {t.replies.map(r => (
                            <div key={r.id} className={`rounded-xl border p-3 ${r.author_type === 'team' ? 'bg-blue-50/50 border-blue-100' : 'bg-gray-50 border-gray-100'}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-700">{r.author_label}</span>
                                <span className="text-xs text-gray-400">{fmt(r.created_at)}</span>
                              </div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <TicketAttachments ticketId={t.id} token={token} canUpload={t.status !== 'closed'} compact />
                      {t.status !== 'closed' && (
                        <div className="space-y-2">
                          <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2} placeholder="Add a reply…" className="input w-full text-sm" />
                          <div className="flex flex-wrap items-center gap-2">
                            {contacts.length > 0 && (
                              <select value={replyContact} onChange={e => setReplyContact(e.target.value)} className="input text-sm w-40">
                                <option value="">Your name…</option>
                                {contacts.map(c => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
                              </select>
                            )}
                            <button onClick={() => sendReply(t.id)} disabled={isPending} className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50">
                              {isPending ? 'Sending…' : 'Send reply'}
                            </button>
                          </div>
                          {replyError && <p className="text-sm text-red-600">{replyError}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">Marmoset Digital Media · Agency OS</p>
      </div>
    </div>
  )
}
