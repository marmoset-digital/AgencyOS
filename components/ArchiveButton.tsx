'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { archiveCompany, unarchiveCompany } from '@/app/actions/clients'
import { archiveProject, unarchiveProject } from '@/app/actions/projects'

// Archive / restore control for a client or a project.
// Nothing is ever hard-deleted — archiving only sets archived_at, so invoices,
// tasks, time logs and Xero links are all preserved and the action is reversible.
export default function ArchiveButton({
  kind,
  id,
  archived,
  name,
}: {
  kind: 'client' | 'project'
  id: string
  archived: boolean
  name?: string
}) {
  const router = useRouter()
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const noun = kind === 'client' ? 'client' : 'project'

  function run() {
    if (!archived) {
      const extra =
        kind === 'client'
          ? 'Its invoices, projects, tickets and history are kept, and its Xero contact is untouched.'
          : 'Its tasks, time logs and history are kept.'
      if (!confirm(`Archive ${name ? `“${name}”` : `this ${noun}`}?\n\nIt will be hidden from lists and dropdowns. ${extra}\n\nYou can restore it at any time.`)) {
        return
      }
    }
    setErr(null)
    startTransition(async () => {
      const res = archived
        ? kind === 'client'
          ? await unarchiveCompany(id)
          : await unarchiveProject(id)
        : kind === 'client'
          ? await archiveCompany(id)
          : await archiveProject(id)
      if (res && 'error' in res && res.error) {
        setErr(res.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={
          archived
            ? 'border border-green-200 bg-green-50 text-green-700 hover:border-green-300 text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-60'
            : 'border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-900 text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-60'
        }
      >
        {pending ? '…' : archived ? 'Restore' : 'Archive'}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  )
}
