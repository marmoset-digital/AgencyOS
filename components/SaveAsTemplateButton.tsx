'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveProjectAsTemplate } from '@/app/actions/projectTemplates'

// Captures this project's task list as a reusable template.
// Due dates are stored as offsets from the project's start date, so the schedule
// travels to the new project instead of stale fixed dates.
export default function SaveAsTemplateButton({
  projectId,
  projectName,
}: {
  projectId: string
  projectName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(projectName)
  const [description, setDescription] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setErr(null); setMsg(null)
    start(async () => {
      const res = await saveProjectAsTemplate(projectId, name, description)
      if (res.error) { setErr(res.error); return }
      setMsg('Template saved.')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setErr(null); setMsg(null) }}
        className="border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-900 text-sm font-medium px-4 py-2 rounded-lg transition"
      >
        Save as template
      </button>

      {msg && <span className="ml-2 text-xs text-green-600">{msg}</span>}

      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Template name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="input w-full text-sm"
              placeholder="When would you use this template?"
            />
          </div>
          <p className="text-xs text-gray-400">
            Captures this project&rsquo;s tasks — title, description, priority, estimate, and each due
            date as a day offset from the project start.
          </p>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save template'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </span>
  )
}
