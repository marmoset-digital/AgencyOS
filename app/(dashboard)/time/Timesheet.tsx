'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

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

function hrs(mins: number) {
  return (mins / 60).toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + 'h'
}
function money(n: number) {
  return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
// Local (Melbourne) YYYY-MM-DD — built from local parts, never toISOString(), which
// would shift the day for a UTC+10 browser.
function localYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayKey(iso: string) {
  return localYmd(new Date(iso))
}
function weekStartKey(iso: string) {
  const d = new Date(iso)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // back to Monday
  return localYmd(d)
}
function fmtDayLabel(key: string) {
  return new Date(key + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtWeekLabel(key: string) {
  const start = new Date(key + 'T00:00:00')
  const end = new Date(start); end.setDate(end.getDate() + 6)
  const f = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  return `${f(start)} – ${f(end)}`
}

type Grain = 'totals' | 'daily' | 'weekly'

export default function Timesheet({
  entries, users, companies, projects, period,
}: {
  entries: Entry[]
  users: Opt[]
  companies: Opt[]
  projects: Opt[]
  period: { ym: string; label: string; prev: string; next: string }
}) {
  const [userId, setUserId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [billable, setBillable] = useState('') // '', 'billable', 'internal'
  const [grain, setGrain] = useState<Grain>('totals')

  const filtered = useMemo(() => entries.filter(e => {
    if (userId && e.userId !== userId) return false
    if (companyId && e.companyId !== companyId) return false
    if (projectId && e.projectId !== projectId) return false
    if (billable === 'billable' && !e.isBillable) return false
    if (billable === 'internal' && e.isBillable) return false
    return true
  }), [entries, userId, companyId, projectId, billable])

  const totals = useMemo(() => {
    let mins = 0, billMins = 0, cost = 0
    for (const e of filtered) {
      mins += e.minutes
      if (e.isBillable) billMins += e.minutes
      cost += e.cost
    }
    return { mins, billMins, internalMins: mins - billMins, cost }
  }, [filtered])

  // Per-person: month totals, or a per-day / per-week breakdown.
  const perPerson = useMemo(() => {
    type Row = { userName: string; periodKey: string; periodLabel: string; mins: number; billMins: number; cost: number }
    const m = new Map<string, Row>()
    for (const e of filtered) {
      const pKey = grain === 'daily' ? dayKey(e.loggedAt) : grain === 'weekly' ? weekStartKey(e.loggedAt) : ''
      const key = `${e.userName}||${pKey}`
      const cur = m.get(key) ?? {
        userName: e.userName,
        periodKey: pKey,
        periodLabel: grain === 'daily' ? fmtDayLabel(pKey) : grain === 'weekly' ? fmtWeekLabel(pKey) : '',
        mins: 0, billMins: 0, cost: 0,
      }
      cur.mins += e.minutes
      if (e.isBillable) cur.billMins += e.minutes
      cur.cost += e.cost
      m.set(key, cur)
    }
    const rows = [...m.values()]
    // Sort by person, then most-recent period first.
    rows.sort((a, b) => a.userName.localeCompare(b.userName) || b.periodKey.localeCompare(a.periodKey))
    return rows
  }, [filtered, grain])

  // Total time per task (all timer events for a task added together).
  const byTask = useMemo(() => {
    type Row = { key: string; task: string; project: string | null; mins: number; billMins: number }
    const m = new Map<string, Row>()
    for (const e of filtered) {
      const key = e.taskId ?? (e.projectId ? `notask:${e.projectId}` : 'unassigned')
      const cur = m.get(key) ?? {
        key,
        task: e.taskTitle ?? 'Project work (no task)',
        project: e.projectName,
        mins: 0, billMins: 0,
      }
      cur.mins += e.minutes
      if (e.isBillable) cur.billMins += e.minutes
      m.set(key, cur)
    }
    return [...m.values()].sort((a, b) => b.mins - a.mins)
  }, [filtered])

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Time Tracking</h1>
          <p className="text-gray-500 mt-1">Logged time across the team — {period.label}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/time?month=${period.prev}`} className="border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600">← Prev</Link>
          <span className="text-sm font-medium text-gray-700 w-32 text-center">{period.label}</span>
          <Link href={`/time?month=${period.next}`} className="border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600">Next →</Link>
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

      {/* By person — with a Totals / Daily / Weekly view toggle */}
      {filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">By person</div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(['totals', 'daily', 'weekly'] as Grain[]).map(g => (
                <button
                  key={g}
                  onClick={() => setGrain(g)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition ${
                    grain === g ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {g === 'totals' ? 'Month total' : g}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {perPerson.map(r => (
              <div key={`${r.userName}||${r.periodKey}`} className="flex items-center gap-3 text-sm">
                <span className="text-gray-800 w-40 truncate">{r.userName}</span>
                {grain !== 'totals' && <span className="text-gray-500 w-32 text-xs">{r.periodLabel}</span>}
                <span className="text-gray-700 w-20 text-right">{hrs(r.mins)}</span>
                <span className="text-green-700 w-24 text-right text-xs">{hrs(r.billMins)} billable</span>
                <span className="text-gray-500 w-24 text-right text-xs">{money(r.cost)} cost</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By task — every timer for a task added together */}
      {byTask.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By task (total time each)</div>
          <div className="flex flex-col gap-1.5">
            {byTask.map(r => (
              <div key={r.key} className="flex items-center gap-3 text-sm">
                <span className="text-gray-800 flex-1 truncate" title={r.task}>{r.task}</span>
                {r.project && <span className="text-gray-400 w-40 text-xs truncate">{r.project}</span>}
                <span className="text-gray-800 w-20 text-right font-medium">{hrs(r.mins)}</span>
                <span className="text-green-700 w-24 text-right text-xs">{hrs(r.billMins)} billable</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
