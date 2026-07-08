import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ProposalBuilder, { type BuilderService, type BuilderProposal } from '../ProposalBuilder'

export const metadata = { title: 'Edit proposal' }

export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, company_id, title, content, expires_at')
    .eq('id', id)
    .single()
  if (!proposal) notFound()

  const [{ data: company }, { data: services }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('id', proposal.company_id).single(),
    supabase.from('services').select('id, name, pricing_type, fixed_price, monthly_fee, hourly_rate').eq('is_active', true).order('sort_order', { ascending: true }).order('name', { ascending: true }),
  ])
  if (!company) notFound()

  return (
    <ProposalBuilder
      companyId={company.id}
      companyName={company.name}
      services={(services ?? []) as BuilderService[]}
      proposal={{
        id: proposal.id,
        title: proposal.title,
        content: proposal.content as BuilderProposal['content'],
        expires_at: proposal.expires_at,
      }}
    />
  )
}
