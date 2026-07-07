'use client'

import { useState, useTransition, useEffect, Fragment } from 'react'
import { createTask, updateTaskStatus, deleteTask } from '@/app/actions/projects'
import { startTimer, stopTimer, logTime } from '@/app/actions/time'
import { editTask, addSubtask, toggleSubtask, deleteSubtask } from '@/app/actions/tasks'
import { addComment, deleteComment } from '@/app/actions/comments'
import ApprovalRequester, { type ApprovalContact, type ApprovalItem } from '@/components/ApprovalRequester'
import type { Task, User } from '@/types'
import type { ActiveTimer } from '@/types/time'
import type { Subtask } from '@/types/subtask'
import type { TaskComment } from '@/types/comment'

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

interface Props {
  tasks: Task[]
  projectId: string
  companyId: string
  users: User[]
  minutesByTask: Record<string, number>
  activeTimer: ActiveTimer | null
  subtasksByTask: Record<string, Subtask[]>
  commentsByTask: Record<string, TaskComment[]>
  currentUserId: string
  contacts: ApprovalContact[]
  approvalsByTask: Record<string, ApprovalItem[]>
}

function fmtMins(m?: number) {
  if (!m) return '0m'
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`
}

function liveElapsed(startedAt: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatDue(date?: string) {
  if (!date) return null
  const d = new Date(date)
  const now = new Date()
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const label = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  if (diff < 0) return <span className="text-red-600 text-xs font-medium">⚠ {label}</span>
  if (diff <= 3) return <span className="text-orange-600 text-xs font-medium">⏰ {label}</span>
  return <span className="text-gray-400 text-xs">{label}</span>
}

function subtaskProgress(subs?: Subtask[]) {
  if (!subs || subs.length === 0) return null
  const done = subs.filter(s => s.completed).length
  return `${done}/${subs.length}`
}

// Small approval indicator for tasks that need client sign-off.
function approvalBadge(requires: boolean, approvals: ApprovalItem[]): { label: string; cls: string } | null {
  const has = (s: string) => approvals.some(a => a.status === s)
  if (has('pending')) return { label: '⏳ Awaiting client', cls: 'bg-amber-100 text-amber-700' }
  if (has('approved')) return { label: '✓ Approved', cls: 'bg-green-100 text-green-700' }
  if (has('changes_requested')) return { label: '✏ Changes requested', cls: 'bg-blue-100 text-blue-700' }
  if (requires) return { label: '🔖 Approval needed', cls: 'bg-amber-50 text-amber-700 border border-amber-200' }
  return null
}

// Per-task start/stop timer with live elapsed display.
function TaskTimer({
  taskId,
  projectId,
  isRunning,
  startedAt,
}: {
  taskId: string
  projectId: string
  isRunning: boolean
  startedAt?: string
}) {
  const [isPending, start] = useTransition()
  const [, force] = useState(0)

  useEffect(() => {
    if (!isRunning) return
    const i = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(i)
  }, [isRunning])

  if (isRunning && startedAt) {
    return (
      <button
        onClick={() => start(async () => { await stopTimer(projectId) })}
        disabled={isPending}
        title="Stop timer"
        className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
      >
        ⏹ {liveElapsed(startedAt)}
      </button>
    )
  }

  return (
    <button
      onClick={() => start(async () => { await startTimer(taskId, projectId) })}
      disabled={isPending}
      title="Start timer"
      className="inline-flex items-center gap-1 text-xs font-medium text-[#E8611A] hover:text-[#d45516] disabled:opacity-50"
    >
      ▶ Start
    </button>
  )
}

// Expanded panel: client approval (if required) + subtasks + inline edit + comments.
function TaskDetailPanel({
  task,
  projectId,
  companyId,
  users,
  contacts,
  approvals,
  subtasks,
  comments,
  currentUserId,
}: {
  task: Task
  projectId: string
  companyId: string
  users: User[]
  contacts: ApprovalContact[]
  approvals: ApprovalItem[]
  subtasks: Subtask[]
  comments: TaskComment[]
  currentUserId: string
}) {
  const [isPending, startT] = useTransition()
  const [editing, setEditing] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [mentionSel, setMentionSel] = useState<string[]>([])
  const requiresApproval = Boolean((task as unknown as { requires_approval?: boolean }).requires_approval)

  const userName = (uid?: string | null) => users.find(u => u.id === uid)?.full_name ?? 'Someone'

  function toggleMention(uid: string) {
    setMentionSel(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid])
  }

  function postComment() {
    const text = commentText.trim()
    if (!text) return
    const mentions = mentionSel
    setCommentText('')
    setMentionSel([])
    startT(async () => { await addComment(task.id, projectId, text, mentions) })
  }

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 space-y-5">
      {/* Client approval */}
      {(requiresApproval || approvals.length > 0) && (
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Client approval</div>
          <ApprovalRequester
            scope="task"
            projectId={projectId}
            companyId={companyId}
            taskId={task.id}
            defaultTitle={task.title}
            contacts={contacts}
            approvals={approvals}
          />
        </div>
      )}

      {/* Subtasks */}
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Subtasks</div>
        {subtasks.length === 0 && (
          <div className="text-xs text-gray-400 mb-2">No subtasks yet.</div>
        )}
        <div className="flex flex-col gap-1.5 mb-2">
          {subtasks.map(s => (
            <div key={s.id} className="flex items-center gap-2 group/st">
              <input
                type="checkbox"
                checked={s.completed}
                onChange={() => startT(async () => { await toggleSubtask(s.id, !s.completed, projectId) })}
                className="w-4 h-4 rounded accent-[#E8611A] cursor-pointer"
              />
              <span className={`text-sm ${s.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{s.title}</span>
              <button
                onClick={() => startT(async () => { await deleteSubtask(s.id, projectId) })}
                className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover/st:opacity-100 transition ml-1"
                title="Delete subtask"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <form
          action={async (fd) => { await addSubtask(task.id, projectId, (fd.get('title') as string) ?? '') }}
          className="flex items-center gap-2 max-w-md"
        >
          <input name="title" required placeholder="Add a subtask…" className="input text-sm flex-1" />
          <button type="submit" disabled={isPending} className="text-xs font-semibold text-[#E8611A] hover:text-[#d45516] disabled:opacity-50 whitespace-nowrap">+ Add</button>
        </form>
      </div>

      {/* Comments */}
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Comments</div>
        {comments.length === 0 && (
          <div className="text-xs text-gray-400 mb-2">No comments yet.</div>
        )}
        <div className="flex flex-col gap-3 mb-3">
          {comments.map(c => (
            <div key={c.id} className="group/cm">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-gray-700">
                  {c.author_id === currentUserId ? 'You' : (c.author?.full_name ?? userName(c.author_id))}
                </span>
                <span className="text-[11px] text-gray-400">{fmtDateTime(c.created_at)}</span>
                <button
                  onClick={() => startT(async () => { await deleteComment(c.id, projectId) })}
                  className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover/cm:opacity-100 transition ml-1"
                  title="Delete comment"
                >
                  ✕
                </button>
              </div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{c.content}</div>
              {c.mentions && c.mentions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {c.mentions.map(uid => (
                    <span key={uid} className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">@{userName(uid)}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Composer */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 max-w-2xl">
          <textarea
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            rows={2}
            placeholder="Write a comment…"
            className="input resize-none text-sm w-full mb-2"
          />
          {users.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-[11px] text-gray-400 mr-1">Mention:</span>
              {users.map(u => {
                const on = mentionSel.includes(u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleMention(u.id)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition ${
                      on ? 'bg-[#E8611A] text-white border-[#E8611A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    @{u.full_name.split(' ')[0]}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={postComment}
              disabled={isPending || !commentText.trim()}
              className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              Post comment
            </button>
            {mentionSel.length > 0 && (
              <span className="text-[11px] text-gray-400">will notify {mentionSel.length} {mentionSel.length === 1 ? 'person' : 'people'}</span>
            )}
          </div>
        </div>
      </div>

      {/* Edit task */}
      {!editing ? (
        <button
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 transition"
        >
          ✎ Edit task
        </button>
      ) : (
        <form
          action={async (fd) => { await editTask(task.id, projectId, fd); setEditing(false) }}
          className="bg-white border border-gray-200 rounded-xl p-4"
        >
          <div className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Edit task</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <input name="title" required defaultValue={task.title} className="input" placeholder="Task title *" />
            </div>
            <div>
              <select name="priority" defaultValue={task.priority} className="input text-sm">
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
              </select>
            </div>
            <div>
              <select name="assignee_id" defaultValue={task.assignee_id ?? ''} className="input text-sm">
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <select name="status" defaultValue={task.status} className="input text-sm">
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div>
              <input name="due_date" type="date" defaultValue={task.due_date ?? ''} className="input text-sm" />
            </div>
            <div>
              <input name="time_estimate" type="number" min="0" step="15" defaultValue={task.time_estimate ?? ''} className="input text-sm" placeholder="Est. minutes" />
            </div>
            <div className="col-span-2">
              <textarea name="description" rows={2} defaultValue={task.description ?? ''} className="input resize-none text-sm" placeholder="Description (optional)" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input id={`edit_ra_${task.id}`} name="requires_approval" type="checkbox" defaultChecked={requiresApproval} className="w-4 h-4 rounded accent-[#E8611A]" />
              <label htmlFor={`edit_ra_${task.id}`} className="text-sm text-gray-600">This task needs client approval</label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={isPending} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
              Save changes
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

export default function TaskBoard({ tasks: initialTasks, projectId, companyId, users, minutesByTask, activeTimer, subtasksByTask, commentsByTask, currentUserId, contacts, approvalsByTask }: Props) {
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showLogForm, setShowLogForm] = useState(false)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Keep the local task list in sync when the server sends fresh data
  // (e.g. after adding a task, which revalidates the page).
  useEffect(() => { setTasks(initialTasks) }, [initialTasks])

  function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    startTransition(async () => {
      await updateTaskStatus(taskId, newStatus, projectId)
    })
  }

  function handleDelete(taskId: string) {
    if (!confirm('Delete this task?')) return
    setTasks(prev => prev.filter(t => t.id !== taskId))
    startTransition(async () => {
      await deleteTask(taskId, projectId)
    })
  }

  const tasksByStatus = {
    todo: tasks.filter(t => t.status === 'todo'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    done: tasks.filter(t => t.status === 'done'),
  }

  const commentCount = (taskId: string) => (commentsByTask[taskId]?.length ?? 0)
  const requiresApproval = (t: Task) => Boolean((t as unknown as { requires_approval?: boolean }).requires_approval)
  const approvalsFor = (taskId: string) => approvalsByTask[taskId] ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ☰ List
          </button>
          <button
            onClick={() => setView('kanban')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ⊞ Board
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {tasks.filter(t => t.status === 'done').length} / {tasks.length} done
          </span>
          <button
            onClick={() => setShowLogForm(v => !v)}
            className="border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-900 text-xs font-semibold px-3 py-2 rounded-lg transition"
          >
            ⏱ Log time
          </button>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
          >
            + Add Task
          </button>
        </div>
      </div>

      {showLogForm && (
        <form
          action={async (fd) => {
            fd.append('project_id', projectId)
            await logTime(fd)
            setShowLogForm(false)
          }}
          className="bg-white border border-gray-200 rounded-xl p-4 mb-4"
        >
          <div className="text-xs font-semibold text-gray-500 mb-3">Log time manually</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <select name="task_id" className="input text-sm">
                <option value="">Project (no specific task)</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            <div>
              <input name="hours" type="number" min="0" step="1" className="input text-sm" placeholder="Hours" />
            </div>
            <div>
              <input name="minutes" type="number" min="0" max="59" step="1" className="input text-sm" placeholder="Minutes" />
            </div>
            <div>
              <input name="logged_at" type="date" className="input text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <input id="is_billable" name="is_billable" type="checkbox" defaultChecked className="w-4 h-4 rounded accent-[#E8611A]" />
              <label htmlFor="is_billable" className="text-sm text-gray-600">Billable</label>
            </div>
            <div className="col-span-2">
              <input name="description" className="input text-sm" placeholder="Note (optional)" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={isPending} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
              Save time
            </button>
            <button type="button" onClick={() => setShowLogForm(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </form>
      )}

      {showAddForm && (
        <form
          action={async (fd) => {
            fd.append('project_id', projectId)
            fd.append('company_id', companyId)
            await createTask(fd)
            setShowAddForm(false)
          }}
          className="bg-white border border-[#E8611A] rounded-xl p-4 mb-4"
        >
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <input name="title" required autoFocus className="input" placeholder="Task title *" />
            </div>
            <div>
              <select name="priority" className="input text-sm">
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
                <option value="low">Low priority</option>
              </select>
            </div>
            <div>
              <select name="assignee_id" className="input text-sm">
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <input name="due_date" type="date" className="input text-sm" />
            </div>
            <div>
              <input name="time_estimate" type="number" min="0" step="15" className="input text-sm" placeholder="Est. minutes (e.g. 60)" />
            </div>
            <div className="col-span-2">
              <textarea name="description" rows={2} className="input resize-none text-sm" placeholder="Description (optional)" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input id="add_requires_approval" name="requires_approval" type="checkbox" className="w-4 h-4 rounded accent-[#E8611A]" />
              <label htmlFor="add_requires_approval" className="text-sm text-gray-600">This task needs client approval</label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={isPending} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
              Add Task
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </form>
      )}

      {view === 'list' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {tasks.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">No tasks yet — add the first one above.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500 w-8"></th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Task</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Assignee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Due</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => {
                  const subs = subtasksByTask[task.id] ?? []
                  const prog = subtaskProgress(subs)
                  const cCount = commentCount(task.id)
                  const expanded = expandedTaskId === task.id
                  const badge = approvalBadge(requiresApproval(task), approvalsFor(task.id))
                  return (
                    <Fragment key={task.id}>
                      <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition group">
                        <td className="px-5 py-3.5">
                          <input
                            type="checkbox"
                            checked={task.status === 'done'}
                            onChange={() => handleStatusChange(task.id, task.status === 'done' ? 'todo' : 'done')}
                            className="w-4 h-4 rounded accent-[#E8611A] cursor-pointer"
                          />
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setExpandedTaskId(expanded ? null : task.id)}
                              className="text-gray-400 hover:text-gray-700 text-xs w-4 flex-shrink-0"
                              title={expanded ? 'Collapse' : 'Expand'}
                            >
                              {expanded ? '▾' : '▸'}
                            </button>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</span>
                                {badge && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>}
                              </div>
                              {task.description && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{task.description}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOURS[task.priority]}`}>{task.priority}</span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 text-xs">{(task as any).assignee?.full_name ?? '—'}</td>
                        <td className="px-4 py-3.5">{formatDue(task.due_date)}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-gray-600">{fmtMins(minutesByTask[task.id] ?? 0)}</span>
                            <TaskTimer
                              taskId={task.id}
                              projectId={projectId}
                              isRunning={activeTimer?.task_id === task.id}
                              startedAt={activeTimer?.started_at}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-1">
                            <select
                              value={task.status}
                              onChange={e => handleStatusChange(task.id, e.target.value as TaskStatus)}
                              className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-[#E8611A]"
                            >
                              <option value="todo">To Do</option>
                              <option value="in_progress">In Progress</option>
                              <option value="done">Done</option>
                            </select>
                            <div className="flex items-center gap-2">
                              {prog && <span className="text-[11px] text-gray-400">☑ {prog}</span>}
                              {cCount > 0 && <span className="text-[11px] text-gray-400">💬 {cCount}</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button onClick={() => handleDelete(task.id)} className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition">✕</button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <TaskDetailPanel
                              task={task}
                              projectId={projectId}
                              companyId={companyId}
                              users={users}
                              contacts={contacts}
                              approvals={approvalsFor(task.id)}
                              subtasks={subs}
                              comments={commentsByTask[task.id] ?? []}
                              currentUserId={currentUserId}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view === 'kanban' && (
        <div className="grid grid-cols-3 gap-4">
          {STATUS_COLUMNS.map(col => (
            <div key={col.key} className="flex flex-col gap-2">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${col.colour}`}>
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{col.label}</span>
                <span className="ml-auto text-xs text-gray-500">{tasksByStatus[col.key].length}</span>
              </div>
              <div className="flex flex-col gap-2 min-h-[120px]">
                {tasksByStatus[col.key].length === 0 && (
                  <div className="border-2 border-dashed border-gray-200 rounded-lg h-16 flex items-center justify-center text-xs text-gray-400">No tasks</div>
                )}
                {tasksByStatus[col.key].map(task => {
                  const prog = subtaskProgress(subtasksByTask[task.id])
                  const cCount = commentCount(task.id)
                  const badge = approvalBadge(requiresApproval(task), approvalsFor(task.id))
                  return (
                    <div key={task.id} className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:shadow-md transition group">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium text-gray-900 leading-snug">{task.title}</p>
                        <button onClick={() => handleDelete(task.id)} className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition flex-shrink-0">✕</button>
                      </div>
                      {badge && <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-2 ${badge.cls}`}>{badge.label}</span>}
                      {task.description && <p className="text-xs text-gray-400 mb-2 line-clamp-2">{task.description}</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOURS[task.priority]}`}>{task.priority}</span>
                        {task.due_date && formatDue(task.due_date)}
                        {prog && <span className="text-xs text-gray-400">☑ {prog}</span>}
                        {cCount > 0 && <span className="text-xs text-gray-400">💬 {cCount}</span>}
                        {(task as any).assignee && <span className="text-xs text-gray-400 ml-auto">{(task as any).assignee.full_name.split(' ')[0]}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                        <span className="text-xs text-gray-400">⏱ {fmtMins(minutesByTask[task.id] ?? 0)}</span>
                        <span className="ml-auto">
                          <TaskTimer
                            taskId={task.id}
                            projectId={projectId}
                            isRunning={activeTimer?.task_id === task.id}
                            startedAt={activeTimer?.started_at}
                          />
                        </span>
                      </div>
                      <div className="flex gap-1 mt-2">
                        {col.key !== 'todo' && (
                          <button onClick={() => handleStatusChange(task.id, col.key === 'done' ? 'in_progress' : 'todo')} className="text-xs text-gray-400 hover:text-gray-700 transition">← Back</button>
                        )}
                        {col.key !== 'done' && (
                          <button onClick={() => handleStatusChange(task.id, col.key === 'todo' ? 'in_progress' : 'done')} className="text-xs text-[#E8611A] hover:text-[#d45516] font-medium transition ml-auto">
                            {col.key === 'todo' ? 'Start →' : 'Complete ✓'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
