'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { buildImportPlan, MAX_BYTES, type ImportPlan, type ImportTemplate } from '@/lib/templateCsv'
import { importTemplates, type ImportItem } from '@/app/actions/projectTemplates'

type Choice = 'skip' | 'replace' | 'create'
type ExistingLite = { id: string; name: string }

function melbToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function typeLabel(t: string | null) {
  return t === 'retainer' ? 'Retainer' : t === 'project' ? 'One-off' : '—'
}

export default function TemplatesImport({ existing }: { existing: ExistingLite[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [choices, setChoices] = useState<Choice[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const existingByName = new Map(existing.map(e => [e.name.trim().toLowerCase(), e]))
  const clashFor = (t: ImportTemplate) => existingByName.get(t.name.trim().toLowerCase())

  function reset() {
    setPlan(null); setChoices([]); setSummary(null); setErr(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(null); setSummary(null)
    if (file.size > MAX_BYTES) { setErr(`File is larger than ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`); setOpen(true); return }
    const text = await file.text()
    const p = buildImportPlan(text)
    setPlan(p)
    // Default every clashing template to Skip, non-clashing to Create.
    setChoices(p.templates.map(t => (clashFor(t) ? 'skip' : 'create')))
    setOpen(true)
  }

  function confirmImport() {
    if (!plan) return
    const items: ImportItem[] = []
    plan.templates.forEach((t, i) => {
      const clash = clashFor(t)
      const choice = choices[i]
      if (clash && choice === 'skip') return
      const base: ImportItem = { name: t.name, description: t.description, type: t.type, tasks: t.tasks }
      if (clash && choice === 'replace') items.push({ ...base, id: clash.id })
      else if (clash && choice === 'create') items.push({ ...base, name: `${t.name} (imported ${melbToday()})` })
      else items.push(base) // no clash
    })
    if (items.length === 0) { setSummary('Nothing imported — every template was skipped.'); return }
    start(async () => {
      const res = await importTemplates(items)
      if (res.error) { setErr(res.error); return }
      setSummary(`Imported: ${res.created} created, ${res.replaced} replaced, ${res.tasksCreated} tasks in total.`)
      router.refresh()
    })
  }

  const skipped = plan ? plan.templates.filter((t, i) => clashFor(t) && choices[i] === 'skip').length : 0

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
      <button
        onClick={() => fileRef.current?.click()}
        className="border border-gray-300 hover:border-gray-400 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg transition"
      >
        Import CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-6 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Import templates from CSV</h2>
              <button onClick={() => { setOpen(false); reset() }} className="text-gray-400 hover:text-gray-700 text-sm">Close</button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* File-level error (rejects the whole file) */}
              {plan && !plan.ok && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-700 mb-1">Nothing was imported — fix these and try again:</p>
                  <ul className="text-xs text-red-600 list-disc pl-5 space-y-0.5">
                    {plan.errors.slice(0, 30).map((er, i) => <li key={i}>{er}</li>)}
                  </ul>
                  {plan.errors.length > 30 && <p className="text-xs text-red-500 mt-1">…and {plan.errors.length - 30} more.</p>}
                </div>
              )}

              {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

              {summary && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{summary}</div>}

              {/* Preview */}
              {plan && plan.ok && !summary && (
                <>
                  <p className="text-sm text-gray-600">
                    Found <span className="font-semibold">{plan.templates.length}</span> template{plan.templates.length === 1 ? '' : 's'}.
                    Review below, then confirm. Nothing is written until you do.
                  </p>

                  {plan.warnings.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-medium text-amber-700 mb-1">Warnings (import still allowed):</p>
                      <ul className="text-xs text-amber-700 list-disc pl-5 space-y-0.5">
                        {plan.warnings.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                    {plan.templates.map((t, i) => {
                      const clash = clashFor(t)
                      return (
                        <div key={i} className="p-3 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {t.name}
                              <span className="ml-2 text-[11px] uppercase tracking-wide text-gray-400">{typeLabel(t.type)}</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {t.tasks.length} task{t.tasks.length === 1 ? '' : 's'}
                              {clash && <span className="ml-2 text-amber-600">• name already exists</span>}
                            </div>
                          </div>
                          {clash ? (
                            <select
                              value={choices[i]}
                              onChange={e => setChoices(cs => cs.map((c, j) => (j === i ? (e.target.value as Choice) : c)))}
                              className="input text-xs"
                            >
                              <option value="skip">Skip</option>
                              <option value="replace">Replace</option>
                              <option value="create">Create new copy</option>
                            </select>
                          ) : (
                            <span className="text-xs text-green-600 whitespace-nowrap">Will import</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              {summary ? (
                <button onClick={() => { setOpen(false); reset() }} className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2 rounded-lg transition">Done</button>
              ) : plan && plan.ok ? (
                <>
                  <button onClick={() => { setOpen(false); reset() }} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                  <button
                    onClick={confirmImport}
                    disabled={pending}
                    className="bg-[#254DA5] hover:bg-[#1E3D84] text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50"
                  >
                    {pending ? 'Importing…' : `Confirm import${skipped ? ` (${skipped} skipped)` : ''}`}
                  </button>
                </>
              ) : (
                <button onClick={() => { setOpen(false); reset() }} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
