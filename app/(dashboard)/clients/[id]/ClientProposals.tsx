'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { setProposalStatus, deleteProposal, createProjectFromProposal } from '@/app/actions/proposals'
import { siteOrigin } from '@/lib/publicUrl'

export interface ClientProposal {
  id: string
  title: string
  status: string
  total_value: number | null
  expires_at: string | null
  created_at: string | null
  token: string | null
  project_id: string | null
  signed_name: string | null
  decision_comment: string | null
  responded_at: string | null
  proposal_number: string | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-600' },
  sent: { label: 'Sent', cls: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Accepted', cls: 'bg-green-100 text-green-700' },
  changes_requested: { label: 'Changes requested', cls: 'bg-blue-100 text-blue-700' },
  declined: { label: 'Declined', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', cls: 'bg-gray-100 text-gray-500' },
}

const money = (n: number | null) => (n != null ? `$${Number(n).toLocaleString('en-AU')}` : '—')
const linkFor = (token: string) => `${siteOrigin()}/proposal/${token}`

export default function ClientProposals({ companyId, proposals }: { companyId: string; proposals: ClientProposal[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState<string | null>(null)

  function copy(token: string) {
    navigator.clipboard?.writeText(linkFor(token))
    setCopied(token)
    setTimeout(() => setCopied(c => (c === token ? null : c)), 1500)
  }

  function makeProject(id: string) {
    startTransition(async () => {
      const res = await createProjectFromProposal(id)
      if (res.projectId) router.push(`/projects/${res.projectId}`)
      else router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Proposals</h2>
        <Link href={`/proposals/new?company_id=${companyId}`} className="text-xs text-[#254DA5] hover:underline font-medium">+ New Proposal</Link>
      </div>

      {proposals.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">No proposals yet — <Link href={`/proposals/new?company_id=${companyId}`} className="text-[#254DA5] hover:underline">create one</Link></p>
      ) : (
        <div className="divide-y divide-gray-50">
          {proposals.map(p => {
            const s = STATUS[p.status] ?? STATUS.draft
            return (
              <div key={p.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <Link href={`/proposals/${p.id}`} className="text-sm font-medium text-gray-900 hover:text-[#254DA5] truncate">{p.title}</Link>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {p.proposal_number ? `${p.proposal_number} · ` : ''}{money(p.total_value)}
                      {p.expires_at ? ` · valid to ${new Date(p.expires_at).toLocaleDateString('en-AU')}` : ''}
                      {(p.status === 'accepted' || p.status === 'changes_requested') && p.responded_at
                        ? ` · ${p.signed_name ?? 'Client'} on ${new Date(p.responded_at).toLocaleDateString('en-AU')}` : ''}
                    </div>
                    {p.decision_comment && p.status === 'changes_requested' && (
                      <div className="text-xs text-gray-500 mt-1 italic">“{p.decision_comment}”</div>
                    )}
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${s.cls}`}>{s.label}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <Link href={`/proposals/${p.id}`} className="text-xs text-gray-500 hover:text-gray-800">Edit</Link>
                  {p.token && (
                    <>
                      <a href={linkFor(p.token)} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-gray-800">Open link ↗</a>
                      <button onClick={() => copy(p.token!)} className="text-xs text-gray-500 hover:text-gray-800">{copied === p.token ? 'Copied!' : 'Copy client link'}</button>
                    </>
                  )}
                  {p.status === 'draft' && (
                    <button
                      onClick={() => startTransition(async () => { await setProposalStatus(p.id, 'sent', companyId); router.refresh() })}
                      disabled={isPending}
                      className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50"
                    >
                      Mark sent
                    </button>
                  )}
                  {p.status === 'accepted' && !p.project_id && (
                    <button
                      onClick={() => makeProject(p.id)}
                      disabled={isPending}
                      className="text-xs font-semibold text-[#254DA5] hover:underline disabled:opacity-50"
                    >
                      + Create project
                    </button>
                  )}
                  {p.project_id && (
                    <Link href={`/projects/${p.project_id}`} className="text-xs text-[#254DA5] hover:underline">View project →</Link>
                  )}
                  <button
                    onClick={() => { if (confirm('Delete this proposal?')) startTransition(async () => { await deleteProposal(p.id, companyId); router.refresh() }) }}
                    disabled={isPending}
                    className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50 ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
