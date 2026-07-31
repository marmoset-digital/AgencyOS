import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Timesheet from './Timesheet'

export const metadata = { title: 'Time Tracking' }

// Melbourne-calendar helpers. The server runs in UTC/Singapore, so compute
// Melbourne dates explicitly (date-only string math is DST-safe — no instants).
function melbToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}
function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function dow(ymd: string): number { // 0=Sun .. 6=Sat
  return new Date(ymd + 'T00:00:00Z').getUTCDay()
}
function monthStart(ymd: string) { return ymd.slice(0, 7) + '-01' }

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { from: fromParam, to: toParam } = await searchParams
  const today = melbToday()
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

  // Selected range — default: this month so far (1st → today).
  let from = isDate(fromParam) ? (fromParam as string) : monthStart(today)
  let to = isDate(toParam) ? (toParam as string) : today
  if (from > to) { const t = from; from = to; to = t }

  // Preset ranges (Melbourne calendar).
  const mon = addDays(today, -((dow(today) + 6) % 7))
  const presets = [
    { key: 'today', label: 'Today', from: today, to: today },
    { key: 'yesterday', label: 'Yesterday', from: addDays(today, -1), to: addDays(today, -1) },
    { key: 'this_week', label: 'This week', from: mon, to: addDays(mon, 6) },
    { key: 'last_week', label: 'Last week', from: addDays(mon, -7), to: addDays(mon, -1) },
    { key: 'this_month', label: 'This month', from: monthStart(today), to: today },
    { key: 'last_30', label: 'Last 30 days', from: addDays(today, -29), to: today },
  ]

  // Rates for internal cost
  const { data: settingsRows } = await supabase.from('app_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const r of settingsRows ?? []) settings[r.key] = r.value ?? ''
  const defaultCost = parseFloat(settings.default_cost_rate || '0') || 0

  const { data: users } = await supabase.from('users').select('id, full_name, cost_rate').order('full_name')
  const costByUser = new Map<string, number>()
  for (const u of users ?? []) costByUser.set(u.id, u.cost_rate != null ? Number(u.cost_rate) : defaultCost)

  // Fetch a coarse window (±1 day) around the range; the client filters precisely
  // by Melbourne-local date so timezone/DST boundaries can't mis-bucket an entry.
  const { data: logs } = await supabase
    .from('time_logs')
    .select(`
      id, duration_minutes, is_billable, logged_at, description,
      user:user_id ( id, full_name ),
      project:project_id ( id, name, company:company_id ( id, name ) ),
      task:task_id ( id, title )
    `)
    .gte('logged_at', addDays(from, -1))
    .lte('logged_at', addDays(to, 1))
    .order('logged_at', { ascending: false })

  const entries = (logs ?? []).map((l) => {
    const rec = l as unknown as {
      id: string; duration_minutes: number; is_billable: boolean; logged_at: string; description: string | null
      user: { id: string; full_name: string } | null
      project: { id: string; name: string; company: { id: string; name: string } | null } | null
      task: { id: string; title: string } | null
    }
    const rate = rec.user ? (costByUser.get(rec.user.id) ?? defaultCost) : defaultCost
    return {
      id: rec.id,
      minutes: rec.duration_minutes ?? 0,
      isBillable: !!rec.is_billable,
      loggedAt: rec.logged_at,
      note: rec.description,
      userId: rec.user?.id ?? null,
      userName: rec.user?.full_name ?? '—',
      projectId: rec.project?.id ?? null,
      projectName: rec.project?.name ?? null,
      companyId: rec.project?.company?.id ?? null,
      companyName: rec.project?.company?.name ?? null,
      taskId: rec.task?.id ?? null,
      taskTitle: rec.task?.title ?? null,
      cost: Math.round(((rec.duration_minutes ?? 0) / 60) * rate * 100) / 100,
    }
  })

  const companyMap = new Map<string, string>()
  for (const e of entries) if (e.companyId && e.companyName) companyMap.set(e.companyId, e.companyName)
  const projectMap = new Map<string, string>()
  for (const e of entries) if (e.projectId && e.projectName) projectMap.set(e.projectId, e.projectName)

  return (
    <Timesheet
      entries={entries}
      users={(users ?? []).map(u => ({ id: u.id, name: u.full_name }))}
      companies={[...companyMap].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))}
      projects={[...projectMap].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))}
      range={{ from, to }}
      presets={presets}
    />
  )
}
