'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { updateTaskStatus } from '@/app/actions/projects'

interface GTask {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  assignee_id: string | null
  due_date: string | null
  project_id: string
  assignee: { id: string; full_name: string } | null
  project: { id: string; name: string; stage: string; company: { id: string; name: string } | null } | null
}
interface UserLite { id: string; full_name: string }
interface ProjectLite { id: string; name: string }

const PRIORITY_COLOURS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
}
const STATUS_COLUMNS = [
  { key: 'todo', label: 'To Do', colour: 'bg-gray-100', dot: 'bg-gray-400' },
  { key: 'in_progress', label: 'In Progress', colour: 'bg-blue-50', dot: 'bg-blue-500' },
  { key: 'done', label: 'Done', colour: 'bg-green-50', dot: 'bg-green-500' },
] as const
type TaskStatus = 'todo' | 'in_progress' | 'done'

function fmtMins(m?: number) {
  if (!m) return '0m'
  const h = Math.floor(m / 60), mm = m % 60
  return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`
}
function formatDue(date?: string | null) {
  if (!date) return null
  const d = new Date(date)
  const diff = Math.ceil((d.getTime() - Date.now()) / 86400000)
  const label = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  if (diff < 0) return <span className="text-red-600 text-xs font-medium">⚠ {label}</span>
  if (diff <= 3) return <span className="text-orange-600 text-xs font-medium">⏰ {label}</span>
  return <span className="text-gray-400 text-xs">{label}</span>
}

export default function GlobalTasks({
  tasks: initial, users, projects, minutesByTask,
}: {
  tasks: GTask[]
  users: UserLite[]
  projects: ProjectLite[]
  minutesByTask: Record<string, number>
  currentUserId: string
}) {
  const [tasks, setTasks] = useState<GTask[]>(initial)
  const [view, setView] = useState<'list' | 'board'>('list')
  const [isPending, startTransition] = useTransition()

  const [q, setQ] = useState('')
  const [projectId, setProjectId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [status, setStatus] = useState('active') // active = not done
  const [priority, setPriority] = useState('')

  function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    const t = tasks.find(x => x.id === taskId)
    if (!t) return
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, status: newStatus } : x))
    startTransition(async () => { await updateTaskStatus(taskId, newStatus, t.project_id) })
  }

  const filtered = useMemo(() => {
    const f = q.trim().toLowerCase()
    return tasks.filter(t => {
      if (projectId && t.project_id !== projectId) return false
      if (assigneeId === 'unassigned' ? t.assignee_id : assigneeId && t.assignee_id !== assigneeId) return false
      if (status === 'active' && t.status === 'done') return false
      else if (status !== 'active' && status !== '' && t.status !== status) return false
      if (priority && t.priority !== priority) return false
      if (f && !t.title.toLowerCase().includes(f) && !(t.project?.name.toLowerCase().includes(f)) && !(t.project?.company?.name.toLowerCase().includes(f))) return false
      return true
    })
  }, [tasks, q, projectId, assigneeId, status, priority])

  const byStatus = {
    todo: filtered.filter(t => t.status === 'todo'),
    in_progress: filtered.filter(t => t.status === 'in_progress'),
    done: filtered.filter(t => t.status === 'done'),
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-500 mt-1">All tasks across every project.</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setView('list')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>☰ List</button>
          <button onClick={() => setView('board')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${view === 'board' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>⊞ Board</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search task / project / client…" className="input text-sm w-64" />
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className="input text-sm">
          <option value="">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="input text-sm">
          <option value="">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="input text-sm">
          <option value="active">Active (not done)</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="">All statuses</option>
        </select>
        <select value={priority} onChange={e => setPriority(e.target.value)} className="input text-sm">
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <span className="text-xs text-gray-400 ml-1">{filtered.length} task{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {view === 'list' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">No tasks match these filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-3 font-medium text-gray-500">Task</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Project / Client</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Priority</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Assignee</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Due</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Time</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition">
                    <td className="px-5 py-3.5">
                      <Link href={`/projects/${t.project_id}`} className={`font-medium ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900 hover:text-[#E8611A]'}`}>{t.title}</Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <Link href={`/projects/${t.project_id}`} className="text-xs text-gray-600 hover:text-[#E8611A]">{t.project?.name ?? '—'}</Link>
                      {t.project?.company && <div className="text-[11px] text-gray-400">{t.project.company.name}</div>}
                    </td>
                    <td className="px-4 py-3.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOURS[t.priority] ?? 'bg-gray-100 text-gray-600'}`}>{t.priority}</span></td>
                    <td className="px-4 py-3.5 text-gray-600 text-xs">{t.assignee?.full_name ?? '—'}</td>
                    <td className="px-4 py-3.5">{formatDue(t.due_date)}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-600">{fmtMins(minutesByTask[t.id] ?? 0)}</td>
                    <td className="px-4 py-3.5">
                      <select
                        value={['todo', 'in_progress', 'done'].includes(t.status) ? t.status : 'todo'}
                        onChange={e => handleStatusChange(t.id, e.target.value as TaskStatus)}
                        disabled={isPending}
                        className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-[#E8611A]"
                      >
                        <option value="todo">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {STATUS_COLUMNS.map(col => (
            <div key={col.key} className="flex flex-col gap-2">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${col.colour}`}>
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{col.label}</span>
                <span className="ml-auto text-xs text-gray-500">{byStatus[col.key].length}</span>
              </div>
              <div className="flex flex-col gap-2 min-h-[120px]">
                {byStatus[col.key].length === 0 && (
                  <div className="border-2 border-dashed border-gray-200 rounded-lg h-16 flex items-center justify-center text-xs text-gray-400">No tasks</div>
                )}
                {byStatus[col.key].map(t => (
                  <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:shadow-md transition">
                    <Link href={`/projects/${t.project_id}`} className="text-sm font-medium text-gray-900 hover:text-[#E8611A] leading-snug block mb-1">{t.title}</Link>
                    <div className="text-[11px] text-gray-400 mb-2">{t.project?.name}{t.project?.company ? ` · ${t.project.company.name}` : ''}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOURS[t.priority] ?? 'bg-gray-100 text-gray-600'}`}>{t.priority}</span>
                      {formatDue(t.due_date)}
                      {t.assignee && <span className="text-xs text-gray-400 ml-auto">{t.assignee.full_name.split(' ')[0]}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-400">⏱ {fmtMins(minutesByTask[t.id] ?? 0)}</span>
                      <span className="ml-auto flex gap-1">
                        {col.key !== 'todo' && (
                          <button onClick={() => handleStatusChange(t.id, col.key === 'done' ? 'in_progress' : 'todo')} className="text-xs text-gray-400 hover:text-gray-700 transition">← Back</button>
                        )}
                        {col.key !== 'done' && (
                          <button onClick={() => handleStatusChange(t.id, col.key === 'todo' ? 'in_progress' : 'done')} className="text-xs text-[#E8611A] hover:text-[#d45516] font-medium transition">
                            {col.key === 'todo' ? 'Start →' : 'Complete ✓'}
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
