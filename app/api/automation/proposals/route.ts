import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAutomation } from '@/lib/sharedSecret'
import { sendProposalForEnquiry } from '@/lib/enquiries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// n8n calls this when an enquiry is approved.
// POST /api/automation/proposals
//   { "enquiry_id": "<uuid>", "template": "Paid Discovery", "decided_by": "admin@marmoset.com.au" }
// Creates the client + contact if needed, creates the proposal from the template, marks it
// sent and emails the client the link. Idempotent: a repeat returns the same proposal with
// "existing": true and sends nothing.
const Body = z.object({
  enquiry_id: z.uuid(),
  template: z.string().min(1).max(200).default('Paid Discovery'),
  decided_by: z.string().max(200).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const denied = requireAutomation(req)
  if (denied) return denied

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Bad request body' }, { status: 400 })

  const db = await createAdminClient()
  const result = await sendProposalForEnquiry(db, {
    enquiryId: parsed.data.enquiry_id,
    templateName: parsed.data.template,
    decidedBy: parsed.data.decided_by ?? null,
  })
  if ('error' in result) {
    console.error('[automation/proposals]', result.error)
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 })
  }
  return NextResponse.json(result)
}
