'use client'

import { useState, useTransition } from 'react'
import { inviteUser, updateUserRole, updateUserName, setUserActive } from '@/app/actions/team'
import type { TeamUser } from './page'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'team_member', label: 'Team member' },
  { value: 'intern', label: 'Intern' },
]

function initials(name: string | null) {
  return (name ?? 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

type Notice = { kind: 'ok' | 'error'; text: string } | null

export default function TeamManager({ users, currentUserId }: { users: TeamUser[]; currentUserId: string }) {
  const [isPending, startTransition] = useTransition()

  // Invite form
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('team_member')
  const [inviteMsg, setInviteMsg] = useState<Notice>(null)

  // Shared row status line
  const [rowMsg, setRowMsg] = useState<Notice>(null)

  function submitInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteMsg(null)
    const fd = new FormData()
    fd.set('email', email)
    fd.set('full_name', name)
    fd.set('role', role)
    startTransition(async () => {
      const res = await inviteUser(fd)
      if (res.error) setInviteMsg({ kind: 'error', text: res.error })
      else {
        setInviteMsg({ kind: 'ok', text: res.message ?? 'Invite sent.' })
        setEmail(''); setName(''); setRole('team_member')
      }
    })
  }

  function run(action: () => Promise<{ error?: string; ok?: true }>, okText?: string) {
    setRowMsg(null)
    startTransition(async () => {
      const res = await action()
      if (res.error) setRowMsg({ kind: 'error', text: res.error })
      else if (okText) setRowMsg({ kind: 'ok', text: okText })
    })
  }

  return (
    <>
      {/* Invite */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-1">Invite a teammate</h2>
        <p className="text-sm text-gray-500 mb-4">
          They’ll get an email to set their own password. New people can be assigned to projects and tasks once they’ve joined.
        </p>
        <form onSubmit={submitInvite} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Lewis Smith" className="input w-52" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="lewis@marmoset.com.au" className="input w-64" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} className="input w-40">
              {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <button type="submit" disabled={isPending} className="bg-[#E8611A] hover:bg-[#d45516] text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
            {isPending ? 'Sending…' : 'Send invite'}
          </button>
        </form>
        {inviteMsg && (
          <p className={`text-sm mt-3 ${inviteMsg.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{inviteMsg.text}</p>
        )}
      </div>

      {/* Members */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Members</h2>
          <span className="text-xs text-gray-400">{users.filter(u => u.is_active).length} active</span>
        </div>

        {rowMsg && (
          <p className={`text-sm mb-3 ${rowMsg.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{rowMsg.text}</p>
        )}

        <div className="divide-y divide-gray-100">
          {users.map(u => (
            <MemberRow
              key={`${u.id}:${u.role}:${u.is_active}`}
              u={u}
              isSelf={u.id === currentUserId}
              isPending={isPending}
              onRole={r => run(() => updateUserRole(u.id, r))}
              onName={n => run(() => updateUserName(u.id, n), 'Name updated.')}
              onActive={a => run(() => setUserActive(u.id, a), a ? 'Reactivated.' : 'Deactivated.')}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function MemberRow({
  u, isSelf, isPending, onRole, onName, onActive,
}: {
  u: TeamUser
  isSelf: boolean
  isPending: boolean
  onRole: (role: string) => void
  onName: (name: string) => void
  onActive: (active: boolean) => void
}) {
  const [name, setName] = useState(u.full_name ?? '')
  const dirty = name.trim() !== (u.full_name ?? '')

  return (
    <div className={`flex items-center gap-3 py-3 ${u.is_active ? '' : 'opacity-60'}`}>
      <div className="w-9 h-9 rounded-full bg-[#E8611A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        {initials(u.full_name)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="text-sm font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-[#E8611A] focus:outline-none w-52 max-w-full"
          />
          {isSelf && <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">You</span>}
          {!u.is_active && <span className="text-[10px] uppercase tracking-wide bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Inactive</span>}
          {dirty && (
            <button onClick={() => onName(name)} disabled={isPending} className="text-xs text-[#E8611A] font-medium hover:underline disabled:opacity-50">
              Save
            </button>
          )}
        </div>
        <div className="text-xs text-gray-400 truncate">{u.email ?? '—'}</div>
      </div>

      <select
        defaultValue={u.role ?? 'team_member'}
        onChange={e => onRole(e.target.value)}
        disabled={isPending}
        className="input text-sm w-36 disabled:opacity-50"
        title="Role"
      >
        {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>

      {u.is_active ? (
        <button
          onClick={() => onActive(false)}
          disabled={isPending || isSelf}
          title={isSelf ? 'You can’t deactivate yourself' : 'Deactivate — blocks login'}
          className="text-xs font-medium border border-gray-200 hover:border-red-300 text-gray-600 hover:text-red-600 px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-600"
        >
          Deactivate
        </button>
      ) : (
        <button
          onClick={() => onActive(true)}
          disabled={isPending}
          className="text-xs font-medium border border-gray-200 hover:border-green-300 text-gray-600 hover:text-green-700 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
        >
          Reactivate
        </button>
      )}
    </div>
  )
}
