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

// Low-level send to a specific address via the Emailit HTTP API. Fire-and-forget:
// never throws into the caller.
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  await deliver(
    to,
    subject,
    `${html}<p style="margin-top:16px;color:#888;font-size:12px">Marmoset Agency OS · <a href="${APP}/dashboard">${APP}/dashboard</a></p>`,
  )
}

// Client-facing send: no internal dashboard footer (clients cannot log in to Agency OS).
// Returns whether Emailit accepted it, so automation callers can report a failed send.
// Still never throws.
export async function sendClientEmail(to: string, subject: string, html: string): Promise<boolean> {
  return deliver(to, subject, html)
}

async function deliver(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const key = process.env.EMAILIT_API_KEY
    if (!key) return false // not configured — silently skip
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    })
    return res.ok
  } catch {
    // best-effort only — never surface to the caller
    return false
  }
}

// Team notification → the configured NOTIFY_EMAIL (defaults to admin@).
export async function notifyTeam(subject: string, html: string): Promise<void> {
  await sendEmail(process.env.NOTIFY_EMAIL || 'admin@marmoset.com.au', subject, html)
}

// Convenience builder for the proposal-decision email.
export function proposalDecisionEmail(who: string, accepted: boolean, companyId: string | null, comment?: string) {
  // `who` and `comment` are typed by the client on the public page, so escape them.
  const subject = `${accepted ? '✅ Proposal accepted' : '✏️ Changes requested'} — ${who}`
  const html =
    `<p><strong>${esc(who)}</strong> ${accepted ? 'accepted a proposal' : 'requested changes to a proposal'}.</p>` +
    (comment ? `<blockquote style="color:#444">“${esc(comment)}”</blockquote>` : '') +
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

// Client email: "here is your proposal". Sent by the automation when an enquiry is approved
// (and usable later from the proposal page). Plain, short, one link.
export function proposalSentEmail(firstName: string | null, title: string, url: string) {
  const hello = firstName ? `Hi ${esc(firstName)},` : 'Hi,'
  const subject = `Your proposal from Marmoset: ${title}`
  const html =
    `<p>${hello}</p>` +
    `<p>Thanks for getting in touch. Here is your proposal for <strong>${esc(title)}</strong>.</p>` +
    `<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;` +
    `text-decoration:none;border-radius:6px">View your proposal</a></p>` +
    `<p>You can read it, ask for changes or accept it from that page. Just reply to this email if ` +
    `you have any questions.</p>` +
    `<p>Marmoset Digital Media</p>`
  return { subject, html }
}
