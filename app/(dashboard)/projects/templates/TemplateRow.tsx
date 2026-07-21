'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { renameProjectTemplate, deleteProjectTemplate } from '@/app/actions/projectTemplates'

export default function TemplateRow({
  id,
  name,
  description,
  taskCount,
  spanDays,
}: {
  id: string
  name: string
  description: string | null
  taskCount: number
  spanDays: number | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [n, setN] = useState(name)
  const [d, setD] = useState(description ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setErr(null)
    start(async () => {
      const res = await renameProjectTemplate(id, n, d)
      if (res.error) { setErr(res.error); return }
      setEditing(false)
      router.refresh()
    })
  }

  function remove() {
    if (!confirm(`Delete the template “${name}”?\n\nProjects already created from it are not affected.`)) return
    setErr(null)
    start(async () => {
      const res = await deleteProjectTemplate(id)
      if (res.error) { setErr(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="p-4">
      {editing ? (
        <div className="space-y-2">
          <input value={n} onChange={e => setN(e.target.value)} className="input w-full text-sm" />
          <textarea value={d} onChange={e => setD(e.target.value)} rows={2} className="input w-full text-sm" placeholder="Description (optional)" />
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={pending} className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50">
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setN(name); setD(description ?? '') }} className="text-xs text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900">{name}</div>
            {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
            <p className="text-xs text-gray-400 mt-1">
              {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
              {spanDays !== null && spanDays > 0 ? ` · spans ${spanDays} days` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-gray-700 transition">Rename</button>
            <button onClick={remove} disabled={pending} className="text-xs text-gray-400 hover:text-red-600 transition disabled:opacity-50">Delete</button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </div>
  )
}
