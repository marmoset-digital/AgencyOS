'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Entry {
  id: string
  minutes: number
  isBillable: boolean
  loggedAt: string
  note: string | null
  userId: string | null
  userName: string
  projectId: string | null
  projectName: string | null
  companyId: string | null
  companyName: string | null
  taskId: string | null
  taskTitle: string | null
  cost: number
}
interface Opt { id: string; name: string }
interface Preset { key: string; label: string; from: string; to: string }

function hrs(mins: number) {
  return (mins / 60).toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + 'h'
}
function money(n: number) {
  return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
// Melbourne-local day key (browser is in Australia/Melbourne, DST-aware).
function localYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayKey(iso: string) { return localYmd(new Date(iso)) }
function fmtFull(ymd: string) {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Timesheet({
  entries, users, companies, projects, range, presets,
}: {
  entries: Entry[]
  users: Opt[]
  companies: Opt[]
  projects: Opt[]
  range: { from: string; to: string }
  presets: Preset[]
}) {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [billable, setBillable] = useState('') // '', 'billable', 'internal'
  const [customFrom, setCustomFrom] = useState(range.from)
  const [customTo, setCustomTo] = useState(range.to)

  // Precise range filter by Melbourne-local date (the server fetched a ±1-day margin).
  const inRange = useMemo(() => entries.filter(e => {
    const d = dayKey(e.loggedAt)
    return d >= range.from && d <= range.to
  }), [entries, range.from, range.to])

  const filtered = useMemo(() => inRange.filter(e => {
    if (userId && e.userId !== userId) return false
    if (companyId && e.companyId !== companyId) return false
    if (projectId && e.projectId !== projectId) return false
    if (billable === 'billable' && !e.isBillable) return false
    if (billable === 'internal' && e.isBillable) return false
    return true
  }), [inRange, userId, companyId, projectId, billable])

  const totals = useMemo(() => {
    let mins = 0, billMins = 0, cost = 0
    for (const e of filtered) {
      mins += e.minutes
      if (e.isBillable) billMins += e.minutes
      cost += e.cost
    }
    return { mins, billMins, internalMins: mins - billMins, cost }
  }, [filtered])

  const byPerson = useMemo(() => {
    const m = new Map<string, { mins: number; billMins: number; cost: number }>()
    for (const e of filtered) {
      const cur = m.get(e.userName) ?? { mins: 0, billMins: 0, cost: 0 }
      cur.mins += e.minutes
      if (e.isBillable) cur.billMins += e.minutes
      cur.cost += e.cost
      m.set(e.userName, cur)
    }
    return [...m].sort((a, b) => b[1].mins - a[1].mins)
  }, [filtered])

  const byTask = useMemo(() => {
    const m = new Map<string, { label: string; project: string | null; mins: number; billMins: number }>()
    for (const e of filtered) {
      const key = e.taskId ?? (e.projectId ? 'notask:' + e.projectId : 'unassigned')
      const label = e.taskTitle ?? (e.projectId ? 'Project work (no task)' : 'Unassigned')
      const cur = m.get(key) ?? { label, project: e.projectName, mins: 0, billMins: 0 }
      cur.mins += e.minutes
      if (e.isBillable) cur.billMins += e.minutes
      m.set(key, cur)
    }
    return [...m.values()].sort((a, b) => b.mins - a.mins)
  }, [filtered])

  const applyCustom = () => {
    let f = customFrom, t = customTo
    if (!f || !t) return
    if (f > t) { const x = f; f = t; t = x }
    router.push(`/time?from=${f}&to=${t}`)
  }

  const activePreset = presets.find(p => p.from === range.from && p.to === range.to)?.key
  const rangeLabel = range.from === range.to ? fmtFull(range.from) : `${fmtFull(range.from)} – ${fmtFull(range.to)}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Time Tracking</h1>
        <p className="text-gray-500 mt-1">Logged time across the team — {rangeLabel}.</p>
      </div>

      {/* Range presets + custom */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {presets.map(p => {
            const active = p.key === activePreset
            return (
              <Link
                key={p.key}
                href={`/time?from=${p.from}&to=${p.to}`}
                className={
                  'rounded-lg px-3 py-1.5 text-sm border ' +
                  (active
                    ? 'bg-[#E8611A] border-[#E8611A] text-white'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600')
                }
              >
                {p.label}
              </Link>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-400">Custom range</span>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="input text-sm" />
          <span className="text-gray-400 text-sm">→</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="input text-sm" />
          <button onClick={applyCustom} className="rounded-lg px-3 py-1.5 text-sm bg-gray-900 text-white hover:bg-gray-800">Apply</button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">Total time</div>
          <div className="text-xl font-bold text-gray-900">{hrs(totals.mins)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">Billable</div>
          <div className="text-xl font-bold text-green-700">{hrs(totals.billMins)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">Internal (non-billable)</div>
          <div className="text-xl font-bold text-gray-900">{hrs(totals.internalMins)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-400 mb-1">Internal cost</div>
          <div className="text-xl font-bold text-gray-900">{money(totals.cost)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select value={userId} onChange={e => setUserId(e.target.value)} className="input text-sm">
          <option value="">Everyone</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="input text-sm">
          <option value="">All clients</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className="input text-sm">
          <option value="">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={billable} onChange={e => setBillable(e.target.value)} className="input text-sm">
          <option value="">Billable + internal</option>
          <option value="billable">Billable only</option>
          <option value="internal">Internal only</option>
        </select>
        <span className="text-xs text-gray-400 ml-1">{filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* By person */}
        {byPerson.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By person</div>
            <div className="flex flex-col gap-1.5">
              {byPerson.map(([name, v]) => (
                <div key={name} className="flex items-center gap-3 text-sm">
                  <span className="text-gray-800 flex-1 min-w-0 truncate">{name}</span>
                  <span className="text-gray-700 w-20 text-right">{hrs(v.mins)}</span>
                  <span className="text-green-700 w-24 text-right text-xs">{hrs(v.billMins)} billable</span>
                  <span className="text-gray-500 w-24 text-right text-xs">{money(v.cost)} cost</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By task */}
        {byTask.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By task</div>
            <div className="flex flex-col gap-1.5">
              {byTask.map((t, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 min-w-0">
                    <span className="text-gray-800 block truncate">{t.label}</span>
                    {t.project && <span className="text-[11px] text-gray-400 block truncate">{t.project}</span>}
                  </span>
                  <span className="text-gray-700 w-20 text-right">{hrs(t.mins)}</span>
                  <span className="text-green-700 w-24 text-right text-xs">{hrs(t.billMins)} billable</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Entries */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No time logged for these filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-5 py-3 font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 font-medium text-gray-500">Person</th>
                <th className="px-4 py-3 font-medium text-gray-500">Client / Project</th>
                <th className="px-4 py-3 font-medium text-gray-500">Task / Note</th>
                <th className="px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition">
                  <td className="px-5 py-3 text-gray-600 text-xs whitespace-nowrap">{fmtDate(e.loggedAt)}</td>
                  <td className="px-4 py-3 text-gray-800">{e.userName}</td>
                  <td className="px-4 py-3">
                    {e.projectId ? (
                      <Link href={`/projects/${e.projectId}`} className="text-gray-700 hover:text-[#E8611A]">{e.projectName}</Link>
                    ) : <span className="text-gray-400">—</span>}
                    {e.companyName && <div className="text-[11px] text-gray-400">{e.companyName}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {e.taskTitle ?? <span className="text-gray-400">Project (no task)</span>}
                    {e.note && <div className="text-[11px] text-gray-400 truncate max-w-xs">{e.note}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {e.isBillable
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Billable</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Internal</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800 whitespace-nowrap">{hrs(e.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
