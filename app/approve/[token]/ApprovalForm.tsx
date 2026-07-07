'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitApprovalDecision } from '@/app/actions/approvals'

export default function ApprovalForm({ token }: { token: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(decision: 'approved' | 'changes_requested') {
    setError(null)
    if (!name.trim()) { setError('Please enter your name.'); return }
    if (decision === 'changes_requested' && !comment.trim()) {
      setError('Please tell us what you’d like changed.'); return
    }
    startTransition(async () => {
      const res = await submitApprovalDecision(token, decision, name, comment)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">Please review the above and let us know how you’d like to proceed.</p>

      <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name</label>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Full name"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#E8611A] mb-4"
      />

      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Comment <span className="text-gray-400 font-normal">(required if requesting changes)</span>
      </label>
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        rows={3}
        placeholder="Any notes or changes you’d like…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#E8611A] mb-4"
      />

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => submit('approved')}
          disabled={isPending}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition disabled:opacity-50"
        >
          {isPending ? 'Submitting…' : '✓ Approve'}
        </button>
        <button
          onClick={() => submit('changes_requested')}
          disabled={isPending}
          className="flex-1 border border-gray-300 hover:border-gray-400 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-lg transition disabled:opacity-50"
        >
          Request changes
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-4">By approving, you confirm you’re authorised to sign off on behalf of your organisation.</p>
    </div>
  )
}
