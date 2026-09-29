import 'server-only'

export const inboundDomain = () => process.env.INBOUND_DOMAIN ?? 'in.mybuilder.ca'
export const jobAddress = (token: string) => `job-${token}@${inboundDomain()}`

type Mail = { fromName: string; replyTo: string; to: string[]; cc: string[]; subject: string; text: string; messageId: string; inReplyTo?: string | null }

/**
 * Sends through Postmark when POSTMARK_SERVER_TOKEN is set. Without it (local/dev) the
 * message stays queued — nothing leaves the machine.
 */
export async function sendMail(m: Mail): Promise<{ status: 'sent' | 'queued' | 'failed'; error?: string }> {
  const token = process.env.POSTMARK_SERVER_TOKEN
  if (!token) return { status: 'queued' }
  const from = process.env.EMAIL_FROM ?? 'notifications@mybuilder.ca'
  const headers = [{ Name: 'Message-ID', Value: m.messageId }, ...(m.inReplyTo ? [{ Name: 'In-Reply-To', Value: m.inReplyTo }, { Name: 'References', Value: m.inReplyTo }] : [])]
  try {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': token },
      body: JSON.stringify({ From: `${m.fromName.replace(/[<>"]/g, '')} <${from}>`, ReplyTo: m.replyTo, To: m.to.join(','), Cc: m.cc.join(',') || undefined,
        Subject: m.subject, TextBody: m.text, Headers: headers, MessageStream: 'outbound' }),
    })
    if (!res.ok) return { status: 'failed', error: (await res.text()).slice(0, 500) }
    return { status: 'sent' }
  } catch (e) {
    return { status: 'failed', error: e instanceof Error ? e.message : 'Send failed' }
  }
}
