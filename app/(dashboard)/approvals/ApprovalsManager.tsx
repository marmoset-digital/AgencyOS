'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { revokeApproval } from '@/app/actions/approvals'
import { approvalLink as linkFor } from '@/lib/publicUrl'
import type { RollupRow } from './page'

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Awaiting client', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  changes_requested: { label: 'Changes requested', cls: 'bg-blue-100 text-blue-700' },
  revoked: { label: 'Revoked', cls: 'bg-gray-100 text-gray-500' },
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Awaiting client' },
  { key: 'approved', label: 'Approved' },
  { key: 'changes_requested', label: 'Changes requested' },
]

export default function ApprovalsRollup({ rows }: { rows: RollupRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState('all')
  const [copied, setCopied] = useState<string | null>(null)

  const shown = filter === 'all' ? rows : rows.filter(r => r.status === filter)

  function copy(token: string) {
    navigator.clipboard?.writeText(linkFor(token))
    setCopied(token)
    setTimeout(() => setCopied(c => (c === token ? null : c)), 1500)
  }

  return (
    <>
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-5 w-fit">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              filter === f.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {shown.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing here. Request approvals from a task or a project.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {shown.map(r => {
              const s = STATUS[r.status] ?? STATUS.pending
              const context = [r.projectName, r.taskTitle ? `Task: ${r.taskTitle}` : null, r.contactName].filter(Boolean).join(' · ')
              return (
                <div key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {r.projectId ? (
                          <a href={`/projects/${r.projectId}`} className="text-sm font-medium text-gray-900 hover:text-[#E8611A] truncate">{r.title}</a>
                        ) : (
                          <span className="text-sm font-medium text-gray-900 truncate">{r.title}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {context || 'No project'}
                        {r.status !== 'pending' && r.status !== 'revoked' && r.decided_at ? ` · ${r.signed_name ?? 'Client'} on ${new Date(r.decided_at).toLocaleDateString('en-AU')}` : ''}
                      </div>
                      {r.decision_comment && r.status === 'changes_requested' && (
                        <div className="text-xs text-gray-500 mt-1 italic">“{r.decision_comment}”</div>
                      )}
                    </div>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${s.cls}`}>{s.label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <a href={linkFor(r.token)} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-gray-800">Open link ↗</a>
                    <button onClick={() => copy(r.token)} className="text-xs text-gray-500 hover:text-gray-800">{copied === r.token ? 'Copied!' : 'Copy link'}</button>
                    {r.status === 'pending' && (
                      <button
                        onClick={() => startTransition(async () => { await revokeApproval(r.id, r.projectId ?? undefined); router.refresh() })}
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
