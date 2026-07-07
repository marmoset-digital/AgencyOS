import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Timesheet from './Timesheet'

export const metadata = { title: 'Time Tracking' }

function monthPeriod(monthStr?: string) {
  const melNow = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit',
  }).format(new Date())
  const ym = monthStr && /^\d{4}-\d{2}$/.test(monthStr) ? monthStr : melNow
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return {
    ym,
    start: `${ym}-01`,
    end: `${ym}-${String(lastDay).padStart(2, '0')}`,
    prev: fmt(new Date(y, m - 2, 1)),
    next: fmt(new Date(y, m, 1)),
    label: new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
  }
}

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { month } = await searchParams
  const period = monthPeriod(month)

  // Rates for internal cost
  const { data: settingsRows } = await supabase.from('app_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const r of settingsRows ?? []) settings[r.key] = r.value ?? ''
  const defaultCost = parseFloat(settings.default_cost_rate || '0') || 0

  const { data: users } = await supabase.from('users').select('id, full_name, cost_rate').order('full_name')
  const costByUser = new Map<string, number>()
  for (const u of users ?? []) costByUser.set(u.id, u.cost_rate != null ? Number(u.cost_rate) : defaultCost)

  const { data: logs } = await supabase
    .from('time_logs')
    .select(`
      id, duration_minutes, is_billable, logged_at, description,
      user:user_id ( id, full_name ),
      project:project_id ( id, name, company:company_id ( id, name ) ),
      task:task_id ( id, title )
    `)
    .gte('logged_at', period.start)
    .lte('logged_at', period.end)
    .order('logged_at', { ascending: false })

  // Shape entries + attach internal cost per entry
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
      period={{ ym: period.ym, label: period.label, prev: period.prev, next: period.next }}
    />
  )
}
