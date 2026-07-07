'use client'

import { useState, useTransition } from 'react'
import { addProjectMember, removeProjectMember } from '@/app/actions/projectMembers'

interface Person { id: string; full_name: string; role?: string | null }

export default function ProjectTeam({
  projectId, members, allUsers, managerId,
}: {
  projectId: string
  members: Person[]
  allUsers: Person[]
  managerId: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [pick, setPick] = useState('')

  const memberIds = new Set(members.map(m => m.id))
  const addable = allUsers.filter(u => !memberIds.has(u.id))

  function add() {
    if (!pick) return
    const id = pick
    setPick('')
    startTransition(async () => { await addProjectMember(projectId, id) })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Team</h2>
        <span className="text-xs text-gray-400">{members.length} member{members.length === 1 ? '' : 's'}</span>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-gray-400 mb-3">No team members yet — add people who work on this project.</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {members.map(m => (
            <span key={m.id} className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full pl-3 pr-2 py-1 text-sm text-gray-800">
              {m.full_name}
              {m.id === managerId && <span className="text-[10px] uppercase tracking-wide bg-[#E8611A] text-white px-1.5 py-0.5 rounded">Manager</span>}
              <button
                onClick={() => startTransition(async () => { await removeProjectMember(projectId, m.id) })}
                disabled={isPending}
                title="Remove from project"
                className="text-gray-300 hover:text-red-500 text-xs disabled:opacity-50"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {addable.length > 0 && (
        <div className="flex items-center gap-2">
          <select value={pick} onChange={e => setPick(e.target.value)} className="input text-sm w-56">
            <option value="">Add a team member…</option>
            {addable.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <button
            onClick={add}
            disabled={isPending || !pick}
            className="bg-[#E8611A] hover:bg-[#d45516] text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50"
          >
            + Add
          </button>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3">
        The manager is set on the project (Edit). Task assignees are limited to the people on this team.
      </p>
    </div>
  )
}
