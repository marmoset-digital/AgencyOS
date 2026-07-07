'use client'

import { useState, useTransition } from 'react'
import {
  addResourceLink, removeResourceLink,
  addCustomField, updateCustomField, removeCustomField,
} from '@/app/actions/clientData'

type Entity = 'company' | 'project'
export interface ResourceLink { id: string; label: string; url: string }
export interface CustomField { id: string; label: string; value: string | null }

// A friendly icon + tag for common link types (Google Sheets/Docs/Drive, etc.).
function linkKind(url: string): { icon: string; tag: string | null } {
  const u = url.toLowerCase()
  if (u.includes('docs.google.com/spreadsheets')) return { icon: '📊', tag: 'Google Sheet' }
  if (u.includes('docs.google.com/document')) return { icon: '📄', tag: 'Google Doc' }
  if (u.includes('docs.google.com/presentation')) return { icon: '📽', tag: 'Google Slides' }
  if (u.includes('drive.google.com')) return { icon: '📁', tag: 'Google Drive' }
  return { icon: '🔗', tag: null }
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

export default function ClientData({
  entityType, entityId, links, fields,
}: {
  entityType: Entity
  entityId: string
  links: ResourceLink[]
  fields: CustomField[]
}) {
  return (
    <>
      <LinksCard entityType={entityType} entityId={entityId} links={links} />
      <FieldsCard entityType={entityType} entityId={entityId} fields={fields} />
    </>
  )
}

function LinksCard({ entityType, entityId, links }: { entityType: Entity; entityId: string; links: ResourceLink[] }) {
  const [isPending, startTransition] = useTransition()
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [msg, setMsg] = useState<Notice>(null)
  const [adding, setAdding] = useState(false)

  function add() {
    setMsg(null)
    startTransition(async () => {
      const res = await addResourceLink(entityType, entityId, label, url)
      if (res.error) setMsg({ kind: 'error', text: res.error })
      else { setLabel(''); setUrl(''); setAdding(false) }
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Docs &amp; Links</h2>
        <button onClick={() => setAdding(a => !a)} className="text-xs text-[#E8611A] hover:underline font-medium">
          {adding ? 'Cancel' : '+ Add link'}
        </button>
      </div>

      {links.length === 0 && !adding && (
        <p className="text-sm text-gray-400">No links yet — add the client’s Google Sheet, drive folder, dashboards, etc.</p>
      )}

      {links.length > 0 && (
        <div className="space-y-1.5 mb-1">
          {links.map(l => {
            const k = linkKind(l.url)
            return (
              <div key={l.id} className="group flex items-center gap-2 text-sm">
                <span className="shrink-0">{k.icon}</span>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[#E8611A] hover:underline truncate">
                  {l.label}
                </a>
                {k.tag && <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">{k.tag}</span>}
                <button
                  onClick={() => startTransition(async () => { await removeResourceLink(l.id, entityType, entityId) })}
                  disabled={isPending}
                  title="Remove link"
                  className="ml-auto text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      {adding && (
        <div className="mt-3 space-y-2">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (e.g. Client logins sheet)" className="input text-sm w-full" />
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste the link (Google Sheet, drive folder…)" className="input text-sm w-full" />
          <div className="flex items-center gap-2">
            <button onClick={add} disabled={isPending || !label.trim() || !url.trim()} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50">
              {isPending ? 'Saving…' : 'Add'}
            </button>
            {msg && <span className={`text-xs ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</span>}
          </div>
        </div>
      )}
      {!adding && msg?.kind === 'error' && <p className="text-xs text-red-600 mt-2">{msg.text}</p>}
    </div>
  )
}

function FieldsCard({ entityType, entityId, fields }: { entityType: Entity; entityId: string; fields: CustomField[] }) {
  const [isPending, startTransition] = useTransition()
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState<Notice>(null)
  const [adding, setAdding] = useState(false)

  function add() {
    setMsg(null)
    startTransition(async () => {
      const res = await addCustomField(entityType, entityId, label, value)
      if (res.error) setMsg({ kind: 'error', text: res.error })
      else { setLabel(''); setValue(''); setAdding(false) }
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Custom Fields</h2>
        <button onClick={() => setAdding(a => !a)} className="text-xs text-[#E8611A] hover:underline font-medium">
          {adding ? 'Cancel' : '+ Add field'}
        </button>
      </div>

      {fields.length === 0 && !adding && (
        <p className="text-sm text-gray-400">No custom fields — add any extra detail you want to track (hosting, renewal date, portal, etc.).</p>
      )}

      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map(f => (
            <FieldRow key={`${f.id}:${f.value ?? ''}`} field={f} entityType={entityType} entityId={entityId} isPending={isPending} startTransition={startTransition} />
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-3 space-y-2">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Field name (e.g. Hosting provider)" className="input text-sm w-full" />
          <input value={value} onChange={e => setValue(e.target.value)} placeholder="Value (optional)" className="input text-sm w-full" />
          <div className="flex items-center gap-2">
            <button onClick={add} disabled={isPending || !label.trim()} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50">
              {isPending ? 'Saving…' : 'Add'}
            </button>
            {msg && <span className={`text-xs ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function FieldRow({
  field, entityType, entityId, isPending, startTransition,
}: {
  field: CustomField
  entityType: Entity
  entityId: string
  isPending: boolean
  startTransition: (cb: () => void) => void
}) {
  const [value, setValue] = useState(field.value ?? '')
  const dirty = value !== (field.value ?? '')

  return (
    <div className="group flex items-center gap-2 text-sm">
      <div className="w-40 shrink-0 text-gray-500 truncate" title={field.label}>{field.label}</div>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="—"
        className="flex-1 text-gray-900 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-[#E8611A] focus:outline-none py-0.5"
      />
      {dirty && (
        <button
          onClick={() => startTransition(async () => { await updateCustomField(field.id, value, entityType, entityId) })}
          disabled={isPending}
          className="text-xs text-[#E8611A] font-medium hover:underline disabled:opacity-50 shrink-0"
        >
          Save
        </button>
      )}
      <button
        onClick={() => startTransition(async () => { await removeCustomField(field.id, entityType, entityId) })}
        disabled={isPending}
        title="Remove field"
        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition disabled:opacity-30 shrink-0"
      >
        ✕
      </button>
    </div>
  )
}
