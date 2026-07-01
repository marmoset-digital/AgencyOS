'use client'

import { useState, useTransition } from 'react'
import { createTemplate, toggleTemplate, deleteTemplate, generateNow } from '@/app/actions/recurring'
import type { User } from '@/types'
import type { RecurringTemplate } from '@/types/recurring'

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const PRIORITY_COLOURS: Record<string, string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-gray-100 text-gray-600',
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function freqLabel(t: RecurringTemplate) {
  switch (t.frequency) {
    case 'daily': return 'Daily'
    case 'weekly': return `Weekly on ${DOW[t.day_of_week ?? 1]}`
    case 'fortnightly': return `Fortnightly on ${DOW[t.day_of_week ?? 1]}`
    case 'monthly': return `Monthly on the ${ordinal(t.day_of_month ?? 1)}`
    default: return t.frequency
  }
}

interface Props {
  templates: RecurringTemplate[]
  projectId: string
  companyId: string
  users: User[]
}

export default function RecurringTemplates({ templates, projectId, companyId, users }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [freq, setFreq] = useState('weekly')
  const [isPending, startTransition] = useTransition()

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Recurring Tasks</h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
        >
          + New recurring task
        </button>
      </div>

      {showForm && (
        <form
          action={async (fd) => {
            fd.append('project_id', projectId)
            fd.append('company_id', companyId)
            await createTemplate(fd)
            setShowForm(false)
            setFreq('weekly')
          }}
          className="bg-white border border-[#E8611A] rounded-xl p-4 mb-4"
        >
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <input name="title" required autoFocus className="input" placeholder="Task title * (e.g. Monthly SEO report)" />
            </div>
            <div>
              <select name="frequency" value={freq} onChange={e => setFreq(e.target.value)} className="input text-sm">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              {(freq === 'weekly' || freq === 'fortnightly') && (
                <select name="day_of_week" defaultValue="1" className="input text-sm">
                  {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              )}
              {freq === 'monthly' && (
                <input name="day_of_month" type="number" min="1" max="31" defaultValue="1" className="input text-sm" placeholder="Day of month (1–31)" />
              )}
            </div>
            <div>
              <select name="assignee_id" className="input text-sm">
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <select name="priority" className="input text-sm">
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
                <option value="low">Low priority</option>
              </select>
            </div>
            <div>
              <input name="time_estimate" type="number" min="0" step="15" className="input text-sm" placeholder="Est. minutes" />
            </div>
            <div className="col-span-2">
              <textarea name="description" rows={2} className="input resize-none text-sm" placeholder="Description (optional)" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={isPending} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
              Create template
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {templates.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            No recurring tasks yet. Create a template to auto-generate tasks on a schedule.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-500">Recurring task</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Schedule</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Assignee</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Priority</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => {
                const assignee = users.find(u => u.id === t.assignee_id)?.full_name ?? '—'
                return (
                  <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition group">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-gray-900">{t.title}</div>
                      {t.description && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{t.description}</div>}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 text-xs">🔁 {freqLabel(t)}</td>
                    <td className="px-4 py-3.5 text-gray-600 text-xs">{assignee}</td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOURS[t.priority]}`}>{t.priority}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => startTransition(async () => { await toggleTemplate(t.id, !t.active, projectId) })}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                        title="Toggle active"
                      >
                        {t.active ? 'Active' : 'Paused'}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => startTransition(async () => { await generateNow(t.id, projectId) })}
                        disabled={isPending}
                        className="text-xs font-medium text-[#E8611A] hover:text-[#d45516] disabled:opacity-50 mr-3"
                      >
                        Generate now
                      </button>
                      <button
                        onClick={() => { if (confirm('Delete this recurring task?')) startTransition(async () => { await deleteTemplate(t.id, projectId) }) }}
                        className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Due tasks are generated automatically when this project is opened. (Unattended daily
        generation across all projects can be added later via a scheduled job.)
      </p>
    </div>
  )
}
