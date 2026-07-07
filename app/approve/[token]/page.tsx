import { createAdminClient } from '@/lib/supabase/server'
import ApprovalForm from './ApprovalForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Approval request — Marmoset' }

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}

export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const adminDb = await createAdminClient()

  const { data: approval } = await adminDb
    .from('approvals')
    .select('title, message, link_url, status, signed_name, decision_comment, decided_at')
    .eq('token', token)
    .maybeSingle()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="text-[#E8611A] font-bold text-xs tracking-widest uppercase">Marmoset Digital</div>
        </div>

        {!approval ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <h1 className="text-lg font-semibold text-gray-900 mb-1">Link not valid</h1>
            <p className="text-sm text-gray-500">This approval link is invalid or has been removed. Please contact Marmoset for a new one.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h1 className="text-xl font-bold text-gray-900">{approval.title}</h1>

            {approval.message && (
              <p className="text-sm text-gray-600 whitespace-pre-wrap mt-3">{approval.message}</p>
            )}

            {approval.link_url && (
              <a
                href={approval.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-[#E8611A] hover:underline"
              >
                🔗 View the work
              </a>
            )}

            <div className="border-t border-gray-100 my-6" />

            {approval.status === 'pending' && <ApprovalForm token={token} />}

            {approval.status === 'approved' && (
              <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                <div className="font-semibold text-green-800 text-sm">✓ Approved</div>
                <div className="text-sm text-green-700 mt-1">
                  Signed off by {approval.signed_name} on {fmt(approval.decided_at)}.
                </div>
                {approval.decision_comment && (
                  <p className="text-sm text-green-700 mt-2 whitespace-pre-wrap">“{approval.decision_comment}”</p>
                )}
              </div>
            )}

            {approval.status === 'changes_requested' && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                <div className="font-semibold text-amber-800 text-sm">Changes requested</div>
                <div className="text-sm text-amber-700 mt-1">
                  From {approval.signed_name} on {fmt(approval.decided_at)}:
                </div>
                {approval.decision_comment && (
                  <p className="text-sm text-amber-700 mt-2 whitespace-pre-wrap">“{approval.decision_comment}”</p>
                )}
                <p className="text-xs text-amber-600 mt-3">Marmoset will follow up. No further action needed here.</p>
              </div>
            )}

            {approval.status === 'revoked' && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm text-gray-500">
                This request is no longer active.
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">Marmoset Digital Media · Agency OS</p>
      </div>
    </div>
  )
}
