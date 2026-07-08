'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createApproval, revokeApproval } from '@/app/actions/approvals'
import { approvalLink as linkFor } from '@/lib/publicUrl'

export interface ApprovalContact { id: string; first_name: string | null; last_name: string | null; is_primary?: boolean | null }
export interface ApprovalLink { id: string; label: string; url: string }
export interface ApprovalItem {
  id: string
  token: string
  status: string
  contact_id: string | null
  signed_name: string | null
  decision_comment: string | null
  decided_at: string | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Awaiting client', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  changes_requested: { label: 'Changes requested', cls: 'bg-blue-100 text-blue-700' },
  revoked: { label: 'Revoked', cls: 'bg-gray-100 text-gray-500' },
}

function contactName(c?: ApprovalContact) {
  if (!c) return null
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || null
}

export default function ApprovalRequester({
  scope, projectId, companyId, taskId, defaultTitle, contacts, approvals, links,
}: {
  scope: 'task' | 'project'
  projectId: string
  companyId: string
  taskId?: string
  defaultTitle: string
  contacts: ApprovalContact[]
  approvals: ApprovalItem[]
  links: ApprovalLink[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [contactId, setContactId] = useState('')
  const [message, setMessage] = useState('')
  const [linkChoice, setLinkChoice] = useState('') // '' = none, link id, or '__custom'
  const [linkUrl, setLinkUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const byId = (id: string | null) => contacts.find(c => c.id === id)

  // The work link is either one of the project's Docs & Links, or a pasted URL.
  const effectiveLink = () => {
    if (linkChoice && linkChoice !== '__custom') return links.find(l => l.id === linkChoice)?.url ?? ''
    return linkUrl
  }

  function create() {
    setError(null)
    const fd = new FormData()
    fd.set('title', title)
    fd.set('message', message)
    fd.set('link_url', effectiveLink())
    fd.set('project_id', projectId)
    fd.set('company_id', companyId)
    if (taskId) fd.set('task_id', taskId)
    fd.set('contact_id', contactId)
    startTransition(async () => {
      const res = await createApproval(fd)
      if (res.error) { setError(res.error); return }
      setMessage(''); setLinkChoice(''); setLinkUrl(''); setContactId(''); setTitle(defaultTitle); setOpen(false)
      router.refresh()
    })
  }

  function copy(token: string) {
    navigator.clipboard?.writeText(linkFor(token))
    setCopied(token)
    setTimeout(() => setCopied(c => (c === token ? null : c)), 1500)
  }

  return (
    <div>
      {approvals.length > 0 && (
        <div className="space-y-2 mb-3">
          {approvals.map(a => {
            const s = STATUS[a.status] ?? STATUS.pending
            const cn = contactName(byId(a.contact_id))
            return (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${s.cls}`}>{s.label}</span>
                <span className="text-gray-500 truncate">
                  {a.status === 'pending'
                    ? (cn ? `for ${cn}` : 'link ready')
                    : `${a.signed_name ?? cn ?? 'Client'}${a.decided_at ? ` · ${new Date(a.decided_at).toLocaleDateString('en-AU')}` : ''}`}
                  {a.decision_comment && a.status === 'changes_requested' && <span className="italic"> — “{a.decision_comment}”</span>}
                </span>
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <button onClick={() => copy(a.token)} className="text-xs text-gray-500 hover:text-gray-800">{copied === a.token ? 'Copied!' : 'Copy link'}</button>
                  {a.status === 'pending' && (
                    <button
                      onClick={() => startTransition(async () => { await revokeApproval(a.id, projectId); router.refresh() })}
                      disabled={isPending}
                      className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs font-semibold text-[#E8611A] hover:underline">
          + Request client approval
        </button>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="input text-sm w-full" />
          <select value={contactId} onChange={e => setContactId(e.target.value)} className="input text-sm w-full">
            <option value="">{contacts.length ? 'Choose the client contact (optional)' : 'No contacts on this client yet'}</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>{contactName(c) ?? 'Unnamed contact'}{c.is_primary ? ' (primary)' : ''}</option>
            ))}
          </select>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} placeholder="Message to the client (optional)" className="input text-sm w-full" />
          {links.length > 0 && (
            <select value={linkChoice} onChange={e => setLinkChoice(e.target.value)} className="input text-sm w-full">
              <option value="">No link to the work</option>
              {links.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
              <option value="__custom">Paste a link instead…</option>
            </select>
          )}
          {(links.length === 0 || linkChoice === '__custom') && (
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="Paste the link to the work (optional)" className="input text-sm w-full" />
          )}
          {links.length > 0 && linkChoice === '' && (
            <p className="text-[11px] text-gray-400">Tip: add the deliverable to this project’s Docs &amp; Links to pick it here.</p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button onClick={create} disabled={isPending || !title.trim()} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50">
              {isPending ? 'Creating…' : 'Create link'}
            </button>
            <button onClick={() => { setOpen(false); setError(null) }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
          <p className="text-[11px] text-gray-400">A shareable link is created — copy it to the client. Email sending comes with SMTP.</p>
        </div>
      )}
    </div>
  )
}
