// Internal team notifications for client-initiated events (proposal decisions, new tickets,
// approval decisions), sent via the Emailit HTTP API (v2) with plain fetch — no SDK dependency.
// Fire-and-forget: this NEVER throws into the calling server action, so a failed notification
// email can't break a client's accept / ticket / approval.
//
// Env:
//   EMAILIT_API_KEY  — an Emailit API key (Emailit → API Keys, scope: sending, domain marmoset.com.au)
//   NOTIFY_EMAIL     — where alerts go (optional; defaults to admin@marmoset.com.au)

const FROM = 'Marmoset Agency OS <support@marmoset.com.au>'
const APP = 'https://app.marmoset.com.au'
const ENDPOINT = 'https://api.emailit.com/v2/emails'

export async function notifyTeam(subject: string, html: string): Promise<void> {
  try {
    const key = process.env.EMAILIT_API_KEY
    if (!key) return // not configured — silently skip
    const to = process.env.NOTIFY_EMAIL || 'admin@marmoset.com.au'
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to,
        subject,
        html: `${html}<p style="margin-top:16px;color:#888;font-size:12px">Marmoset Agency OS · <a href="${APP}/dashboard">${APP}/dashboard</a></p>`,
      }),
    })
  } catch {
    // best-effort only — never surface to the caller
  }
}

// Convenience builder for the proposal-decision email.
export function proposalDecisionEmail(who: string, accepted: boolean, companyId: string | null, comment?: string) {
  const subject = `${accepted ? '✅ Proposal accepted' : '✏️ Changes requested'} — ${who}`
  const html =
    `<p><strong>${who}</strong> ${accepted ? 'accepted a proposal' : 'requested changes to a proposal'}.</p>` +
    (comment ? `<blockquote style="color:#444">“${comment}”</blockquote>` : '') +
    `<p><a href="${APP}/clients/${companyId ?? ''}">Open the client in Agency OS →</a></p>`
  return { subject, html }
}
