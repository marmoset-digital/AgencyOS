import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/notify'

// End-of-day reminder: if a user left a timer running, email them at 5pm Melbourne
// so they can stop it (correct time logged) or discard it (forgot to stop earlier).
//
// The cron (see vercel.json) fires at 06:00 AND 07:00 UTC; this only acts when the
// Melbourne local hour is 17, so exactly one run lands at 5pm year-round — the two
// fire times cover both AEST (UTC+10) and AEDT (UTC+11) so daylight saving is handled.

const APP = 'https://app.marmoset.com.au'

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function melbourneHour(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Melbourne', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  return Number(parts.find(p => p.type === 'hour')?.value ?? '-1')
}

function elapsed(startedAt: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export async function runTimerReminder(now: Date = new Date(), force = false) {
  const hour = melbourneHour(now)
  // Only act at 5pm Melbourne (or when forced, for testing).
  if (hour !== 17 && !force) return { skipped: 'not_5pm' as const, melbourneHour: hour, notified: 0 }

  const admin = await createAdminClient()
  const { data: timers } = await admin
    .from('active_timers')
    .select('id, started_at, project_id, user:user_id ( full_name, email ), task:task_id ( title ), project:project_id ( name )')

  let notified = 0
  for (const row of (timers ?? []) as Record<string, unknown>[]) {
    const user = one(row.user as { full_name: string | null; email: string | null } | null)
    const to = user?.email
    if (!to) continue
    const task = one(row.task as { title: string | null } | null)
    const project = one(row.project as { name: string | null } | null)
    const on = task?.title || project?.name || 'a task'

    const subject = `⏱ Your timer is still running — ${on}`
    const html =
      `<p>Hi ${esc(user?.full_name || 'there')},</p>` +
      `<p>You have a timer that's <strong>still running</strong> after ${elapsed(row.started_at as string)} — ` +
      `on <strong>${esc(on)}</strong>${project?.name ? ` (${esc(project.name)})` : ''}.</p>` +
      `<p>If you've finished, <strong>stop</strong> it so the time is logged. If you forgot to stop it ` +
      `earlier, you can <strong>discard</strong> it instead.</p>` +
      `<p><a href="${APP}/projects/${(row.project_id as string) ?? ''}">Open the project →</a></p>`

    await sendEmail(to, subject, html)
    notified++
  }

  return { ok: true as const, notified, melbourneHour: hour }
}
