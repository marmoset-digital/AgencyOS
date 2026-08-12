import ClientActivity from '@/components/ClientActivity'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LIVE_STAGES, formatMoney } from '@/lib/clientContext'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch key metrics
  const [
    { count: activeProjects },
    { count: openTickets },
    { count: overdueTasks },
    { data: recentProjects },
    { data: overdueInvoices },
    { count: liveProjects },
    { data: activeCharges },
    { data: archivedCompanies },
    { data: me },
  ] = await Promise.all([
    supabase.from('projects').select('*', { count: 'exact', head: true }).in('stage', ['active', 'onboarding', 'awaiting_feedback']).is('archived_at', null),
    supabase.from('support_tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'todo').lt('due_date', new Date().toISOString().split('T')[0]),
    supabase.from('projects').select('id, name, stage, companies(name)').in('stage', ['active', 'onboarding', 'awaiting_feedback']).is('archived_at', null).order('updated_at', { ascending: false }).limit(5),
    supabase.from('invoices').select('id, invoice_number, amount, due_date, companies(name)').eq('status', 'overdue').order('due_date', { ascending: true }).limit(5),
    // Revenue card: live (non-closed) project count + active recurring charges (archived clients filtered out below).
    supabase.from('projects').select('*', { count: 'exact', head: true }).in('stage', LIVE_STAGES as unknown as string[]).is('archived_at', null),
    supabase.from('recurring_charges').select('amount, cadence, company_id').eq('active', true),
    supabase.from('companies').select('id').not('archived_at', 'is', null),
    supabase.from('users').select('role').eq('id', user.id).single(),
  ])

  // Revenue is admin-only — hidden from team members (e.g. Lewis). Gated server-side,
  // so the figures never reach a non-admin's page.
  const isAdmin = me?.role === 'admin'

  // Recurring revenue — exclude charges belonging to archived clients, then split by cadence.
  const archivedIds = new Set((archivedCompanies ?? []).map((c: { id: string }) => c.id))
  const liveCharges = (activeCharges ?? []).filter((c: { company_id: string }) => !archivedIds.has(c.company_id))
  const monthlyRecurring = liveCharges
    .filter((c: { cadence: string }) => c.cadence === 'monthly')
    .reduce((s: number, c: { amount: number | string }) => s + Number(c.amount), 0)
  const yearlyRecurring = liveCharges
    .filter((c: { cadence: string }) => c.cadence === 'yearly')
    .reduce((s: number, c: { amount: number | string }) => s + Number(c.amount), 0)
  const annualisedRunRate = monthlyRecurring * 12 + yearlyRecurring

  const stageLabels: Record<string, string> = {
    quote_sent: 'Quote Sent',
    proposal_accepted: 'Proposal Accepted',
    onboarding: 'Onboarding',
    active: 'Active',
    awaiting_feedback: 'Awaiting Feedback',
    paused: 'Paused',
    complete: 'Complete',
    invoiced_closed: 'Invoiced & Closed',
  }

  const stageColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    onboarding: 'bg-blue-100 text-blue-700',
    awaiting_feedback: 'bg-yellow-100 text-yellow-700',
    paused: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <MetricCard
          label="Active Projects"
          value={activeProjects ?? 0}
          color="orange"
          icon="📁"
          href="/projects"
        />
        <MetricCard
          label="Open Support Tickets"
          value={openTickets ?? 0}
          color="blue"
          icon="🎫"
          href="/tickets"
        />
        <MetricCard
          label="Overdue Tasks"
          value={overdueTasks ?? 0}
          color={overdueTasks && overdueTasks > 0 ? 'red' : 'green'}
          icon="⏰"
          href="/tasks"
        />
      </div>

      {/* Revenue — admin-only */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Revenue</h2>
            <span className="text-xs text-gray-400">Recurring charges on active clients · admin only</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <RevenueFigure label="Monthly recurring" value={formatMoney(monthlyRecurring)} sub="/mo" accent />
            <RevenueFigure label="Yearly recurring" value={formatMoney(yearlyRecurring)} sub="/yr" />
            <RevenueFigure label="Annualised run-rate" value={formatMoney(annualisedRunRate)} sub="monthly×12 + yearly" />
            <RevenueFigure label="Live projects" value={String(liveProjects ?? 0)} sub="all non-closed" href="/projects" />
          </div>
          <p className="text-[11px] text-gray-400 mt-4">Proposal pipeline will appear here once the Proposals module is built.</p>
        </div>
      )}

      {/* Recent client activity */}
      <div className="mb-8">
        <ClientActivity />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Projects */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Active Projects</h2>
            <a href="/projects" className="text-sm text-[#E8611A] hover:underline">View all →</a>
          </div>
          {recentProjects && recentProjects.length > 0 ? (
            <div className="space-y-3">
              {recentProjects.map((project: any) => (
                <div key={project.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="font-medium text-sm text-gray-900">{project.name}</div>
                    <div className="text-xs text-gray-500">{project.companies?.name}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${stageColors[project.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                    {stageLabels[project.stage] ?? project.stage}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No active projects yet</p>
          )}
        </div>

        {/* Overdue Invoices */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Overdue Invoices</h2>
            <a href="/invoices" className="text-sm text-[#E8611A] hover:underline">View all →</a>
          </div>
          {overdueInvoices && overdueInvoices.length > 0 ? (
            <div className="space-y-3">
              {overdueInvoices.map((invoice: any) => (
                <div key={invoice.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="font-medium text-sm text-gray-900">{invoice.companies?.name}</div>
                    <div className="text-xs text-gray-500">{invoice.invoice_number} — due {new Date(invoice.due_date).toLocaleDateString('en-AU')}</div>
                  </div>
                  <span className="text-sm font-semibold text-red-600">
                    ${invoice.amount.toLocaleString('en-AU')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No overdue invoices 🎉</p>
          )}
        </div>
      </div>
    </div>
  )
}

function RevenueFigure({ label, value, sub, accent, href }: {
  label: string
  value: string
  sub?: string
  accent?: boolean
  href?: string
}) {
  const inner = (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4 h-full">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-[#E8611A]' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
  return href ? <Link href={href} className="block transition hover:opacity-80">{inner}</Link> : inner
}

function MetricCard({ label, value, color, icon, href }: {
  label: string
  value: number
  color: 'orange' | 'blue' | 'green' | 'red'
  icon: string
  href?: string
}) {
  const colors = {
    orange: 'border-l-[#E8611A] bg-orange-50',
    blue: 'border-l-blue-500 bg-blue-50',
    green: 'border-l-green-500 bg-green-50',
    red: 'border-l-red-500 bg-red-50',
  }
  const textColors = {
    orange: 'text-[#E8611A]',
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-600',
  }

  const card = (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${colors[color]} p-6 ${href ? 'transition hover:shadow-md hover:border-gray-300' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className={`text-3xl font-bold ${textColors[color]}`}>{value}</p>
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  )

  return href ? <Link href={href} className="block">{card}</Link> : card
}
