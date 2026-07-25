'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveTemplate, deleteProjectTemplate } from '@/app/actions/projectTemplates'
import TemplateTaskEditor, { type EditorRow, BLANK_ROW } from './TemplateTaskEditor'

export type ManagerTemplate = {
  id: string
  name: string
  description: string | null
  type: string | null
  rows: EditorRow[]
}

function rowsToTasks(rows: EditorRow[]) {
  return rows
    .map(r => ({
      title: r.title.trim(),
      description: r.description.trim() || null,
      priority: r.priority,
      time_estimate: r.estimate.trim() ? Number(r.estimate) : null,
      due_offset_days: r.offset.trim() !== '' ? Number(r.offset) : null,
    }))
    .filter(t => t.title)
}

export default function TemplatesManager({ templates }: { templates: ManagerTemplate[] }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setCreating(c => !c)}
          className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          {creating ? 'Cancel' : '+ New template'}
        </button>
      </div>

      {creating && <TemplateForm onDone={() => { setCreating(false); router.refresh() }} />}

      {templates.length === 0 && !creating && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            No templates yet — create one above, or use <span className="font-medium text-gray-600">Save as template</span> on a project.
          </p>
        </div>
      )}

      {templates.map(t => (
        <TemplateCard key={t.id} tpl={t} onDone={() => router.refresh()} />
      ))}
    </div>
  )
}

function TemplateCard({ tpl, onDone }: { tpl: ManagerTemplate; onDone: () => void }) {
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()

  if (editing) {
    return <TemplateForm existing={tpl} onDone={() => { setEditing(false); onDone() }} />
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900">
          {tpl.name}
          {tpl.type && (
            <span className="ml-2 text-[11px] uppercase tracking-wide text-gray-400">
              {tpl.type === 'retainer' ? 'Retainer' : 'One-off'}
            </span>
          )}
        </div>
        {tpl.description && <p className="text-xs text-gray-500 mt-0.5">{tpl.description}</p>}
        <p className="text-xs text-gray-400 mt-1">{tpl.rows.length} {tpl.rows.length === 1 ? 'task' : 'tasks'}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-gray-700 transition">Edit</button>
        <button
          onClick={() => {
            if (!confirm(`Delete template “${tpl.name}”?\n\nProjects already created from it are not affected.`)) return
            start(async () => { await deleteProjectTemplate(tpl.id); onDone() })
          }}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-red-600 transition disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function TemplateForm({ existing, onDone }: { existing?: ManagerTemplate; onDone: () => void }) {
  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [type, setType] = useState(existing?.type ?? '')
  const [rows, setRows] = useState<EditorRow[]>(existing?.rows.length ? existing.rows : [{ ...BLANK_ROW }])
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setErr(null)
    start(async () => {
      const res = await saveTemplate({
        id: existing?.id,
        name,
        description,
        type: type || null,
        tasks: rowsToTasks(rows),
      })
      if (res.error) { setErr(res.error); return }
      onDone()
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Template name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="input w-full text-sm" placeholder="e.g. SEO Onboarding" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type (optional)</label>
          <select value={type} onChange={e => setType(e.target.value)} className="input w-full text-sm">
            <option value="">—</option>
            <option value="retainer">Retainer</option>
            <option value="project">One-off</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
        <input value={description} onChange={e => setDescription(e.target.value)} className="input w-full text-sm" placeholder="When to use this template" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Tasks</label>
        <p className="text-[11px] text-gray-400 mb-2">“Due day” = days from the project start (0 = start day). Leave blank for no due date.</p>
        <TemplateTaskEditor rows={rows} onChange={setRows} />
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={pending || !name.trim()} className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50">
          {pending ? 'Saving…' : existing ? 'Save changes' : 'Create template'}
        </button>
        <button onClick={onDone} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </div>
  )
}
