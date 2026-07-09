'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { enterSupport, createSupportTicket, addSupportReply, type SupportSession, type SupportTicketView } from '@/app/actions/support'

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

export default function SupportEntry() {
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [session, setSession] = useState<SupportSession | null>(null)

  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [showNew, setShowNew] = useState(false)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [reply, setReply] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const inputCls = 'input w-full text-sm'

  function apply(res: SupportSession | { error: string }) {
    if ('error' in res) { return res.error }
    setSession(res)
    return null
  }

  function verify(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    if (!email.trim()) { setError('Please enter your email.'); return }
    startTransition(async () => {
      const res = await enterSupport(email)
      const err = apply(res)
      if (err) setError(err)
      else setShowNew(( 'ok' in res && res.tickets.length === 0))
    })
  }

  function submitTicket() {
    setFormError(null)
    if (!subject.trim()) { setFormError('Please add a subject.'); return }
    startTransition(async () => {
      const res = await createSupportTicket(email, { subject, description, priority })
      const err = apply(res)
      if (err) { setFormError(err); return }
      setSubject(''); setDescription(''); setPriority('medium'); setShowNew(false)
    })
  }

  function sendReply(ticketId: string) {
    setFormError(null)
    if (!reply.trim()) { setFormError('Write a reply first.'); return }
    startTransition(async () => {
      const res = await addSupportReply(email, ticketId, reply)
      const err = apply(res)
      if (err) { setFormError(err); return }
      setReply('')
    })
  }

  // ── Step 1: email gate ──────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Are you a current client?</h2>
        <p className="text-sm text-gray-500 mb-4">Enter the email address we have on file and you can raise a request and see your history — no password needed.</p>
        <form onSubmit={verify} className="flex flex-wrap items-center gap-2">
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@yourcompany.com.au" className="input flex-1 min-w-0" />
          <button type="submit" disabled={isPending} className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
            {isPending ? 'Checking…' : 'Continue'}
          </button>
        </form>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    )
  }

  // ── Step 2: verified — raise + track ────────────────────────────────────────
  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Hi {session.name.split(' ')[0]} 👋</h2>
            <p className="text-sm text-gray-500">{session.company}{' '}·{' '}
              <button onClick={() => { setSession(null); setEmail(''); setExpanded(null) }} className="text-[#254DA5] hover:underline">not you?</button>
            </p>
          </div>
          <button onClick={() => { setShowNew(v => !v); setFormError(null) }} className="text-sm text-[#254DA5] hover:underline font-medium">
            {showNew ? 'Cancel' : '+ New request'}
          </button>
        </div>

        {showNew && (
          <div className="mt-4 space-y-3">
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject — a short summary" className="input w-full" />
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Tell us what's going on, with as much detail as you can." className={inputCls} />
            <div className="w-40">
              <label className="block text-xs text-gray-500 mb-1">Urgency</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
                {PRIORITY_KEYS.map(k => <option key={k} value={k}>{PRIORITY_LABEL[k]}</option>)}
              </select>
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <button onClick={submitTicket} disabled={isPending} className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
              {isPending ? 'Sending…' : 'Submit request'}
            </button>
          </div>
        )}
      </div>

      {session.tickets.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50">
          {session.tickets.map((t: SupportTicketView) => {
            const s = STATUS[t.status] ?? STATUS.open
            const isOpen = expanded === t.id
            return (
              <div key={t.id} className="p-4">
                <button onClick={() => { setExpanded(isOpen ? null : t.id); setReply(''); setFormError(null) }} className="w-full flex items-center gap-3 text-left">
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
                    {t.status !== 'closed' && (
                      <div className="space-y-2">
                        <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2} placeholder="Add a reply…" className={inputCls} />
                        {formError && <p className="text-sm text-red-600">{formError}</p>}
                        <button onClick={() => sendReply(t.id)} disabled={isPending} className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50">
                          {isPending ? 'Sending…' : 'Send reply'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
