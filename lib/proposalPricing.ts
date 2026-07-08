// Shared proposal pricing model + totals. Used by the builder (client), the public proposal
// page (server) and the client list (server) so the numbers always agree.

export type BillingCycle = 'one_off' | 'monthly' | 'quarterly' | 'annually'

export interface ProposalLine {
  id?: string
  kind: string            // 'package' | 'add_on' | 'item'
  description: string
  quantity: number
  billing_cycle: BillingCycle
  unit_price: number
}
export interface ProposalTax {
  id?: string
  label: string
  rate: number            // percent, e.g. 10 for GST
  inclusive: boolean
}
export interface ProposalContent {
  lines: ProposalLine[]
  taxes: ProposalTax[]
  terms: string
  currency: string
}
export interface ProposalTotals {
  once: number
  monthly: number
  quarterly: number
  annually: number
  tax: number
  currency: string
}

export const CYCLES: { value: BillingCycle; label: string; suffix: string }[] = [
  { value: 'one_off', label: 'One-off', suffix: '' },
  { value: 'monthly', label: 'Monthly', suffix: '/month' },
  { value: 'quarterly', label: 'Quarterly', suffix: '/quarter' },
  { value: 'annually', label: 'Annually', suffix: '/year' },
]

export function money(n: number, currency = 'AUD'): string {
  const v = Number.isFinite(n) ? n : 0
  return `${currency === 'AUD' ? '$' : ''}${v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function lineAmount(l: ProposalLine): number {
  return (Number(l.quantity) || 0) * (Number(l.unit_price) || 0)
}

// Accepts the new shape, or converts the legacy { items:[{description,pricing_type,amount}] } shape.
export function normaliseContent(raw: unknown): ProposalContent {
  const c = (raw ?? {}) as Record<string, unknown>
  if (Array.isArray(c.lines)) {
    return {
      lines: (c.lines as ProposalLine[]).map(l => ({
        id: l.id, kind: l.kind || 'item', description: String(l.description ?? ''),
        quantity: Number(l.quantity) || 0, billing_cycle: (l.billing_cycle || 'one_off') as BillingCycle,
        unit_price: Number(l.unit_price) || 0,
      })),
      taxes: Array.isArray(c.taxes) ? (c.taxes as ProposalTax[]).map(t => ({ id: t.id, label: String(t.label ?? ''), rate: Number(t.rate) || 0, inclusive: !!t.inclusive })) : [],
      terms: String(c.terms ?? ''),
      currency: String(c.currency ?? 'AUD'),
    }
  }
  // legacy items → lines
  const items = Array.isArray(c.items) ? (c.items as { description?: string; pricing_type?: string; amount?: number }[]) : []
  return {
    lines: items.map(i => ({
      kind: 'item', description: String(i.description ?? ''), quantity: 1,
      billing_cycle: (i.pricing_type === 'subscription' ? 'monthly' : 'one_off') as BillingCycle,
      unit_price: Number(i.amount) || 0,
    })),
    taxes: [],
    terms: String(c.terms ?? ''),
    currency: String(c.currency ?? 'AUD'),
  }
}

export function computeTotals(content: ProposalContent): ProposalTotals {
  const net: Record<BillingCycle, number> = { one_off: 0, monthly: 0, quarterly: 0, annually: 0 }
  for (const l of content.lines) net[l.billing_cycle] = (net[l.billing_cycle] ?? 0) + lineAmount(l)

  const exclusiveRate = content.taxes.filter(t => !t.inclusive).reduce((s, t) => s + (Number(t.rate) || 0), 0)
  const factor = 1 + exclusiveRate / 100
  const gross = (n: number) => n * factor

  const totalNet = net.one_off + net.monthly + net.quarterly + net.annually
  const tax = totalNet * (exclusiveRate / 100)

  return {
    once: gross(net.one_off),
    monthly: gross(net.monthly),
    quarterly: gross(net.quarterly),
    annually: gross(net.annually),
    tax,
    currency: content.currency || 'AUD',
  }
}

// Short human summary, e.g. "$2,500.00 one-off + $3,000.00/month".
export function summaryText(t: ProposalTotals): string {
  const parts: string[] = []
  if (t.once > 0) parts.push(`${money(t.once, t.currency)} one-off`)
  if (t.monthly > 0) parts.push(`${money(t.monthly, t.currency)}/month`)
  if (t.quarterly > 0) parts.push(`${money(t.quarterly, t.currency)}/quarter`)
  if (t.annually > 0) parts.push(`${money(t.annually, t.currency)}/year`)
  return parts.length ? parts.join(' + ') : money(0, t.currency)
}

// The single figure stored in proposals.total_value (one-off inc tax; recurring is shown via summary).
export function headlineValue(t: ProposalTotals): number {
  return t.once > 0 ? t.once : t.monthly || t.quarterly || t.annually || 0
}
