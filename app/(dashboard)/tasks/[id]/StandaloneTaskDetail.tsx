'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTimer, stopTimer, discardTimer, deleteTimeLog } from '@/app/actions/time'
import { editTask, addSubtask, toggleSubtask, deleteSubtask } from '@/app/actions/tasks'
import type { Subtask } from '@/types/subtask'
import type { ActiveTimer } from '@/types/time'

interface Task {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  assignee_id: string | null
  due_date: string | null
  project_id: string | null
  assignee: { id: string; full_name: string } | null
  project: { id: string; name: string; company: { id: string; name: string } | null } | null
}
interface UserLite { id: string; full_name: string }
interface Log {
  id: string
  duration_minutes: number
  is_billable: boolean
  logged_at: string
  description: string | null
  user_id: string | null
  project_id: string | null
}

function fmtMins(m?: number) {
  if (!m) return '0m'
  const h = Math.floor(m / 60), mm = m % 60
  return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`
}
function liveElapsed(startedAt: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const PRIORITY_COLOURS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
}

export default function StandaloneTaskDetail({
  task, users, subtasks, logs, totalMinutes, activeTimer, currentUserId,
}: {
  task: Task
  users: UserLite[]
  subtasks: Subtask[]
  logs: Log[]
  totalMinutes: number
  activeTimer: ActiveTimer | null
  currentUserId: string
}) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [, force] = useState(0)
  const [editing, setEditing] = useState(false)

  const running = !!activeTimer
  useEffect(() => {
    if (!running) return
    const i = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(i)
  }, [running])

  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh() })
  const userName = (uid?: string | null) => users.find(u => u.id === uid)?.full_name ?? '—'

  const done = subtasks.filter(s => s.completed).length

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/tasks" className="text-sm text-gray-500 hover:text-[#E8611A]">← All tasks</Link>

      <div className="flex items-start justify-between mt-3 mb-6 gap-4">
        <div className="min-w-0">
          <h1 className={`text-2xl font-bold ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOURS[task.priority] ?? 'bg-gray-100 text-gray-600'}`}>{task.priority}</span>
            {task.project
              ? <Link href={`/projects/${task.project.id}`} className="text-xs text-gray-500 hover:text-[#E8611A]">{task.project.name}{task.project.company ? ` · ${task.project.company.name}` : ''}</Link>
              : <span className="text-xs text-gray-400 italic">Internal task</span>}
            <span className="text-xs text-gray-400">Assignee: {task.assignee?.full_name ?? '—'}</span>
          </div>
        </div>
        <button onClick={() => setEditing(e => !e)} className="text-sm text-gray-500 hover:text-gray-800 whitespace-nowrap">{editing ? 'Cancel' : 'Edit'}</button>
      </div>

      {/* Timer + total */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex items-center gap-4">
        {running && activeTimer ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => run(() => stopTimer(task.project_id))}
              disabled={isPending}
              className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
              title="Stop timer & log the time"
            >
              ⏹ {liveElapsed(activeTimer.started_at)}
            </button>
            <button
              onClick={() => { if (confirm('Discard this timer without logging any time?')) run(() => discardTimer(task.project_id)) }}
              disabled={isPending}
              className="text-xs text-gray-300 hover:text-red-500 disabled:opacity-50"
              title="Discard timer (no time logged)"
            >
              ✕ discard
            </button>
          </div>
        ) : (
          <button
            onClick={() => run(() => startTimer(task.id, task.project_id))}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-sm font-medium text-[#E8611A] hover:text-[#d45516] disabled:opacity-50"
            title="Start timer"
          >
            ▶ Start timer
          </button>
        )}
        <span className="ml-auto text-sm text-gray-500">Total logged: <span className="font-semibold text-gray-800">{fmtMins(totalMinutes)}</span></span>
      </div>

      {/* Edit form */}
      {editing && (
        <form
          action={async (fd) => { await editTask(task.id, task.project_id, fd); setEditing(false); router.refresh() }}
          className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-col gap-3"
        >
          <div>
            <label className="text-xs text-gray-500">Title</label>
            <input name="title" required defaultValue={task.title} className="input text-sm w-full mt-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Description</label>
            <textarea name="description" rows={3} defaultValue={task.description ?? ''} className="input text-sm w-full mt-1 resize-none" />
          </div>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="text-xs text-gray-500 block">Assignee</label>
              <select name="assignee_id" defaultValue={task.assignee_id ?? ''} className="input text-sm mt-1">
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block">Priority</label>
              <select name="priority" defaultValue={task.priority} className="input text-sm mt-1">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block">Status</label>
              <select name="status" defaultValue={task.status} className="input text-sm mt-1">
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block">Due date</label>
              <input type="date" name="due_date" defaultValue={task.due_date ? task.due_date.slice(0, 10) : ''} className="input text-sm mt-1 w-40" />
            </div>
          </div>
          <div>
            <button type="submit" disabled={isPending} className="rounded-lg px-4 py-1.5 text-sm bg-[#E8611A] text-white hover:bg-[#d45516] disabled:opacity-50">Save</button>
          </div>
        </form>
      )}

      {/* Description (read view) */}
      {!editing && task.description && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">{task.description}</div>
        </div>
      )}

      {/* Subtasks */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Subtasks{subtasks.length > 0 && <span className="ml-2 text-gray-400 normal-case">{done}/{subtasks.length}</span>}
        </div>
        <div className="flex flex-col gap-2 mb-3">
          {subtasks.length === 0 && <div className="text-xs text-gray-400">No subtasks yet.</div>}
          {subtasks.map(s => (
            <div key={s.id} className="flex items-center gap-2 group/st">
              <input
                type="checkbox"
                checked={s.completed}
                onChange={() => run(() => toggleSubtask(s.id, !s.completed, task.project_id))}
                className="w-4 h-4 rounded accent-[#E8611A] cursor-pointer"
              />
              <span className={`text-[15px] ${s.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{s.title}</span>
              <button
                onClick={() => run(() => deleteSubtask(s.id, task.project_id))}
                className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover/st:opacity-100 transition ml-1"
                title="Delete subtask"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <form
          action={async (fd) => { await addSubtask(task.id, task.project_id, (fd.get('title') as string) ?? ''); router.refresh() }}
          className="flex items-center gap-2 max-w-md"
        >
          <input name="title" required placeholder="Add a subtask…" className="input text-sm flex-1" />
          <button type="submit" disabled={isPending} className="text-xs font-semibold text-[#E8611A] hover:text-[#d45516] disabled:opacity-50 whitespace-nowrap">+ Add</button>
        </form>
      </div>

      {/* Logged time */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Logged time</div>
        {logs.length === 0 ? (
          <div className="text-xs text-gray-400">No time logged yet — use the timer above.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {logs.map(l => (
              <div key={l.id} className="flex items-center gap-3 text-sm group/lg">
                <span className="text-gray-500 text-xs w-32 whitespace-nowrap">{fmtDateTime(l.logged_at)}</span>
                <span className="text-gray-800 w-20">{fmtMins(l.duration_minutes)}</span>
                <span className="text-gray-500 text-xs">{userName(l.user_id)}</span>
                {l.is_billable
                  ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">Billable</span>
                  : <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Internal</span>}
                {l.description && <span className="text-gray-400 text-xs truncate max-w-xs">{l.description}</span>}
                <button
                  onClick={() => { if (confirm('Delete this time log?')) run(() => deleteTimeLog(l.id, l.project_id)) }}
                  className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover/lg:opacity-100 transition ml-auto"
                  title="Delete time log"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
