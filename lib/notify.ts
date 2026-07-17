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


// --- Small HTML escaper for values that appear in notification emails ------------
function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Convenience builder for the new-ticket email.
export function newTicketEmail(subject: string, companyName: string, companyId: string | null, priority: string) {
  const s = `\u{1F3AB} New support ticket \u2014 ${esc(companyName)}`
  const html =
    `<p><strong>${esc(companyName)}</strong> raised a support ticket.</p>` +
    `<p><strong>Subject:</strong> ${esc(subject)}<br><strong>Priority:</strong> ${esc(priority)}</p>` +
    `<p><a href="${APP}/clients/${companyId ?? ''}">Open the client in Agency OS \u2192</a> \u00b7 ` +
    `<a href="${APP}/tickets">Support queue \u2192</a></p>`
  return { subject: s, html }
}

// Convenience builder for the approval-decision email.
export function approvalDecisionEmail(who: string, approved: boolean, title: string, companyId: string | null, comment?: string) {
  const subject = `${approved ? '\u2705 Approval granted' : '\u270F\uFE0F Changes requested'} \u2014 ${esc(title)}`
  const html =
    `<p><strong>${esc(who)}</strong> ${approved ? 'approved' : 'requested changes to'} <strong>${esc(title)}</strong>.</p>` +
    (comment ? `<blockquote style="color:#444">\u201c${esc(comment)}\u201d</blockquote>` : '') +
    `<p><a href="${companyId ? `${APP}/clients/${companyId}` : `${APP}/approvals`}">Open in Agency OS \u2192</a></p>`
  return { subject, html }
}
