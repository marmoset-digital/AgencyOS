'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createDefinition, updateDefinition, deleteDefinition, moveDefinition,
  type FieldDefinition,
} from '@/app/actions/customFields'

type Entity = 'company' | 'project'

const TYPE_LABEL: Record<string, string> = {
  text: 'Text', number: 'Number', date: 'Date', select: 'Dropdown',
}

export default function DefinitionsManager({
  entityType, title, definitions,
}: {
  entityType: Entity
  title: string
  definitions: FieldDefinition[]
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <button onClick={() => setAdding(a => !a)} className="text-xs text-[#E8611A] hover:underline font-medium">
          {adding ? 'Cancel' : '+ Add field'}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Appears on every {entityType === 'company' ? 'client' : 'project'}.
      </p>

      {definitions.length === 0 && !adding && (
        <p className="text-sm text-gray-400">No fields defined yet.</p>
      )}

      {definitions.length > 0 && (
        <div className="divide-y divide-gray-50 mb-2">
          {definitions.map((d, i) => (
            <DefinitionRow
              key={d.id}
              def={d}
              isFirst={i === 0}
              isLast={i === definitions.length - 1}
              onChange={() => router.refresh()}
            />
          ))}
        </div>
      )}

      {adding && (
        <DefinitionForm
          entityType={entityType}
          onDone={() => { setAdding(false); router.refresh() }}
        />
      )}
    </div>
  )
}

function DefinitionRow({
  def, isFirst, isLast, onChange,
}: {
  def: FieldDefinition
  isFirst: boolean
  isLast: boolean
  onChange: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()

  if (editing) {
    return (
      <div className="py-3">
        <DefinitionForm
          entityType={def.entity_type}
          existing={def}
          onDone={() => { setEditing(false); onChange() }}
        />
      </div>
    )
  }

  return (
    <div className="py-3 flex items-center gap-3">
      <div className="flex flex-col">
        <button
          onClick={() => start(async () => { await moveDefinition(def.id, 'up'); onChange() })}
          disabled={pending || isFirst}
          className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none"
          title="Move up"
        >▲</button>
        <button
          onClick={() => start(async () => { await moveDefinition(def.id, 'down'); onChange() })}
          disabled={pending || isLast}
          className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none"
          title="Move down"
        >▼</button>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900">
          {def.label}
          {def.required && <span className="ml-1 text-red-500" title="Required">*</span>}
        </div>
        <div className="text-xs text-gray-400">
          {TYPE_LABEL[def.field_type] ?? def.field_type}
          {def.field_type === 'select' && def.options.length > 0 ? ` · ${def.options.join(', ')}` : ''}
        </div>
      </div>
      <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-gray-700 transition shrink-0">Edit</button>
      <button
        onClick={() => {
          if (!confirm(`Delete “${def.label}”?\n\nIts saved values on every ${def.entity_type === 'company' ? 'client' : 'project'} will be removed too.`)) return
          start(async () => { await deleteDefinition(def.id); onChange() })
        }}
        disabled={pending}
        className="text-xs text-gray-400 hover:text-red-600 transition shrink-0 disabled:opacity-50"
      >Delete</button>
    </div>
  )
}

function DefinitionForm({
  entityType, existing, onDone,
}: {
  entityType: Entity
  existing?: FieldDefinition
  onDone: () => void
}) {
  const [label, setLabel] = useState(existing?.label ?? '')
  const [fieldType, setFieldType] = useState(existing?.field_type ?? 'text')
  const [optionsText, setOptionsText] = useState((existing?.options ?? []).join('\n'))
  const [required, setRequired] = useState(existing?.required ?? false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setErr(null)
    const options = optionsText.split('\n').map(o => o.trim()).filter(Boolean)
    start(async () => {
      const res = existing
        ? await updateDefinition(existing.id, { label, fieldType, options, required })
        : await createDefinition({ entityType, label, fieldType, options, required })
      if (res.error) { setErr(res.error); return }
      onDone()
    })
  }

  return (
    <div className="mt-3 space-y-3 bg-gray-50 rounded-lg p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Field name</label>
          <input value={label} onChange={e => setLabel(e.target.value)} className="input w-full text-sm" placeholder="e.g. Renewal date" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select value={fieldType} onChange={e => setFieldType(e.target.value as FieldDefinition['field_type'])} className="input w-full text-sm">
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="select">Dropdown</option>
          </select>
        </div>
      </div>

      {fieldType === 'select' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Options (one per line)</label>
          <textarea value={optionsText} onChange={e => setOptionsText(e.target.value)} rows={3} className="input w-full text-sm" placeholder={'Basic\nStandard\nPremium'} />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
        Required
      </label>

      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={pending || !label.trim()} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50">
          {pending ? 'Saving…' : existing ? 'Save' : 'Add field'}
        </button>
        <button onClick={onDone} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </div>
  )
}
