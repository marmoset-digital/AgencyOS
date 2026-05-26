'use client'

import { useTransition } from 'react'
import { deleteContact } from '@/app/actions/clients'

export function DeleteContactButton({
  contactId,
  companyId,
}: {
  contactId: string
  companyId: string
}) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm('Delete this contact?')) return
    startTransition(() => {
      deleteContact(contactId, companyId)
    })
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-50"
    >
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  )
}
