'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createApproval, revokeApproval } from '@/app/actions/approvals'
import type { ApprovalRow, ProjectOption } from './page'

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Awaiting client', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  changes_requested: { label: 'Changes requested', cls: 'bg-blue-100 text-blue-700' },
  revoked: { label: 'Revoked', cls: 'bg-gray-100 text-gray-500' },
}

function linkFor(token: string) {
  return typeof window !== 'undefined' ? `${window.location.origin}/approve/${token}` : `/approve/${token}`
}

export default function ApprovalsManager({ approvals, projects }: { approvals: ApprovalRow[]; projects: ProjectOption[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [projectId, setProjectId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  function create() {
    setError(null)
    const fd = new FormData()
    fd.set('title', title)
    fd.set('message', message)
    fd.set('link_url', linkUrl)
    fd.set('project_id', projectId)
    startTransition(async () => {
      const res = await createApproval(fd)
      if (res.error) { setError(res.error); return }
      if (res.token) setJustCreated(res.token)
      setTitle(''); setMessage(''); setLinkUrl(''); setProjectId(''); setOpen(false)
      router.refresh()
    })
  }

  function copy(token: string) {
    navigator.clipboard?.writeText(linkFor(token))
    setCopied(token)
    setTimeout(() => setCopied(c => (c === token ? null : c)), 1500)
  }

  return (
    <>
      {/* Create */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">New approval request</h2>
          <button onClick={() => setOpen(o => !o)} className="text-xs text-[#E8611A] hover:underline font-medium">
            {open ? 'Cancel' : '+ New request'}
          </button>
        </div>

        {open && (
          <div className="mt-4 space-y-3">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (e.g. Homepage design — round 1)" className="input text-sm w-full" />
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Message to the client (optional)" className="input text-sm w-full" />
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="Link to the work (optional — Google Doc, Figma, preview…)" className="input text-sm w-full" />
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="input text-sm w-full">
              <option value="">Not linked to a project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex items-center gap-3">
              <button onClick={create} disabled={isPending || !title.trim()} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                {isPending ? 'Creating…' : 'Create link'}
              </button>
              {error && <span className="text-sm text-red-600">{error}</span>}
            </div>
          </div>
        )}

        {justCreated && (
          <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3">
            <div className="text-sm font-medium text-green-800 mb-1">Link ready — send it to your client:</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border border-green-200 rounded px-2 py-1.5 text-gray-700 truncate">{linkFor(justCreated)}</code>
              <button onClick={() => copy(justCreated)} className="text-xs font-semibold text-[#E8611A] hover:underline shrink-0">
                {copied === justCreated ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Requests</h2>
        {approvals.length === 0 ? (
          <p className="text-sm text-gray-400">No approval requests yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {approvals.map(a => {
              const s = STATUS[a.status] ?? STATUS.pending
              return (
                <div key={a.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{a.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {a.status === 'pending'
                          ? 'Waiting on the client'
                          : a.status === 'revoked'
                            ? 'Revoked'
                            : `${a.signed_name ?? 'Client'} · ${a.decided_at ? new Date(a.decided_at).toLocaleDateString('en-AU') : ''}`}
                      </div>
                      {a.decision_comment && a.status === 'changes_requested' && (
                        <div className="text-xs text-gray-500 mt-1 italic">“{a.decision_comment}”</div>
                      )}
                    </div>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${s.cls}`}>{s.label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <a href={linkFor(a.token)} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-gray-800">Open link ↗</a>
                    <button onClick={() => copy(a.token)} className="text-xs text-gray-500 hover:text-gray-800">
                      {copied === a.token ? 'Copied!' : 'Copy link'}
                    </button>
                    {a.status === 'pending' && (
                      <button
                        onClick={() => startTransition(async () => { await revokeApproval(a.id); router.refresh() })}
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
      </div>
    </>
  )
}
