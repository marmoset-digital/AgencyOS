import type { SupabaseClient } from '@supabase/supabase-js'

// Shared "what does this client have with us" context, used two ways:
//   - team ticket view: projects + services WITH amounts + a total monthly value
//   - client support portal: projects + service names only (no money on a public page)

// Projects that are genuinely live (not archived, not finished/closed). Mirrors the
// ticket auto-link definition so the two stay consistent.
export const LIVE_STAGES = [
  'quote_sent', 'proposal_accepted', 'onboarding', 'active', 'awaiting_feedback', 'paused',
] as const

const STAGE_LABEL: Record<string, string> = {
  quote_sent: 'Quote sent',
  proposal_accepted: 'Proposal accepted',
  onboarding: 'Onboarding',
  active: 'Active',
  awaiting_feedback: 'Awaiting feedback',
  paused: 'Paused',
  complete: 'Complete',
  invoiced_closed: 'Invoiced & closed',
}

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage
}

export type ContextProject = { id: string; name: string; stage: string }
export type ContextService = { id: string; description: string; amount: number; cadence: string }

export type ClientContext = {
  projects: ContextProject[]
  services: ContextService[]
  monthlyValue: number // active services normalised to a monthly figure
}

export async function getClientContext(db: SupabaseClient, companyId: string): Promise<ClientContext> {
  const [{ data: projects }, { data: charges }] = await Promise.all([
    db
      .from('projects')
      .select('id, name, stage')
      .eq('company_id', companyId)
      .is('archived_at', null)
      .in('stage', LIVE_STAGES as unknown as string[])
      .order('created_at', { ascending: false }),
    db
      .from('recurring_charges')
      .select('id, description, amount, cadence')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('amount', { ascending: false }),
  ])

  const services = ((charges ?? []) as ContextService[])
  const monthlyValue = services.reduce(
    (sum, s) => sum + (s.cadence === 'yearly' ? Number(s.amount) / 12 : Number(s.amount)),
    0,
  )

  return {
    projects: (projects ?? []) as ContextProject[],
    services,
    monthlyValue,
  }
}

export function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-AU')}`
}
