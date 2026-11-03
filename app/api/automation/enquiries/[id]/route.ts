import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAutomation } from '@/lib/sharedSecret'
import { updateEnquiry } from '@/lib/enquiries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// n8n records the AI triage result and/or a human decision on an enquiry.
// PATCH /api/automation/enquiries/<id>
//   { "status": "spam" | "poor_fit" | "declined" | "approved" | ...,
//     "ai_verdict": "good_fit", "ai_summary": "...", "ai_model": "...", "decided_by": "admin@..." }
const Body = z.object({
  status: z.enum(['new', 'spam', 'poor_fit', 'declined', 'approved', 'proposal_sent']).optional(),
  ai_verdict: z.string().max(50).nullable().optional(),
  ai_summary: z.string().max(4000).nullable().optional(),
  ai_model: z.string().max(100).nullable().optional(),
  decided_by: z.string().max(200).nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAutomation(req)
  if (denied) return denied

  const { id } = await params
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Bad enquiry id' }, { status: 400 })

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Bad request body' }, { status: 400 })
  const b = parsed.data

  const db = await createAdminClient()
  const result = await updateEnquiry(db, id, {
    status: b.status,
    aiVerdict: b.ai_verdict,
    aiSummary: b.ai_summary,
    aiModel: b.ai_model,
    decidedBy: b.decided_by,
  })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 })
  return NextResponse.json({ ok: true })
}
