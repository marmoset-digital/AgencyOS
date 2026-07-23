'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createStandaloneTask } from '@/app/actions/tasks'

// "+ New task" for an internal task with no project or client.
// Opens an inline form; on save it creates the task and refreshes the list.
export default function NewStandaloneTask({ users }: { users: { id: string; full_name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(formData: FormData) {
    setErr(null)
    start(async () => {
      const res = await createStandaloneTask(formData)
      if (res?.error) { setErr(res.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <span className="relative inline-block">
      <button
        onClick={() => { setOpen(o => !o); setErr(null) }}
        className="bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
      >
        {open ? 'Cancel' : '+ New task'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-[30rem] bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-left">
          <div className="text-sm font-semibold text-gray-900 mb-1">New internal task</div>
          <p className="text-xs text-gray-400 mb-3">Not attached to any project or client.</p>
          <form action={submit} className="space-y-3">
            <input name="title" required placeholder="Task title" className="input w-full text-sm" />
            <textarea name="description" rows={2} placeholder="Description (optional)" className="input w-full text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Assignee</label>
                <select name="assignee_id" defaultValue="" className="input w-full text-sm">
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Priority</label>
                <select name="priority" defaultValue="medium" className="input w-full text-sm">
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Due date (optional)</label>
              <input name="due_date" type="date" className="input w-full text-sm" />
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <div className="flex items-center gap-2">
              <button type="submit" disabled={pending} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50">
                {pending ? 'Adding…' : 'Add task'}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </span>
  )
}
