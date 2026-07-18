'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { updateProjectStage } from '@/app/actions/projects'
import { PROJECT_STAGES } from '@/types'

// Self-contained: this owns the stage colour map so the server page.tsx no longer needs it.
const stageColours: Record<string, string> = {
  quote_sent: 'bg-purple-100 text-purple-700',
  proposal_accepted: 'bg-blue-100 text-blue-700',
  onboarding: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  awaiting_feedback: 'bg-orange-100 text-orange-700',
  paused: 'bg-gray-100 text-gray-600',
  complete: 'bg-teal-100 text-teal-700',
  invoiced_closed: 'bg-gray-100 text-gray-500',
}

// One-click inline stage selector. Optimistically updates the badge, calls the existing
// updateProjectStage server action, and reverts if it fails.
export default function StageSelect({ projectId, stage }: { projectId: string; stage: string }) {
  const router = useRouter()
  const [current, setCurrent] = useState(stage)
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    const prev = current
    setCurrent(next)
    setErr(null)
    startTransition(async () => {
      const res = await updateProjectStage(projectId, next)
      if (res?.error) {
        setCurrent(prev)
        setErr(res.error)
      } else {
        router.refresh()
      }
    })
  }

  const colour = stageColours[current] ?? 'bg-gray-100 text-gray-600'

  return (
    <span className="relative inline-flex items-center">
      <select
        value={current}
        onChange={onChange}
        disabled={pending}
        aria-label="Change project stage"
        title="Change project stage"
        className={`appearance-none cursor-pointer rounded-full text-xs font-medium pl-2.5 pr-6 py-1 focus:outline-none focus:ring-2 focus:ring-[#E8611A]/40 ${colour} ${pending ? 'opacity-60 cursor-wait' : ''}`}
      >
        {PROJECT_STAGES.map((s) => (
          <option key={s.value} value={s.value} className="bg-white text-gray-900">
            {s.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2 h-3 w-3 opacity-60"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
      {err && <span className="ml-2 text-xs text-red-600">{err}</span>}
    </span>
  )
}
