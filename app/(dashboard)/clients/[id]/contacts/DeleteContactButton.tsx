'use client'

import { deleteContact } from '@/app/actions/clients'

export function DeleteContactButton({
  contactId,
  companyId,
}: {
  contactId: string
  companyId: string
}) {
  const deleteAction = deleteContact.bind(null, contactId, companyId)

  return (
    <form action={deleteAction}>
      <button
        type="submit"
        className="text-xs text-red-400 hover:text-red-600 transition"
        onClick={(e) => {
          if (!confirm('Delete this contact?')) e.preventDefault()
        }}
      >
        Delete
      </button>
    </form>
  )
}
