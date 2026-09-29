import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMail } from '@/lib/email'

/**
 * Notification outbox worker. Call every minute from a scheduler (Vercel cron, Supabase pg_net, …)
 * with `Authorization: Bearer $CRON_SECRET`. Sends queued emails through Postmark.
 */
export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || got.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret))
}

async function run(req: NextRequest) {
  if (!authorized(req)) return new NextResponse('Unauthorized', { status: 401 })
  if (!process.env.POSTMARK_SERVER_TOKEN) return NextResponse.json({ sent: 0, skipped: 'email not configured' })
  const admin = createAdminClient()
  const { data: batch, error } = await admin.rpc('claim_deliveries', { p_limit: 50 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  let sent = 0, failed = 0
  for (const d of batch ?? []) {
    const lines = [
      d.first_name ? `Hi ${d.first_name},` : 'Hi,', '', d.title, ...(d.body ? ['', d.body] : []),
      ...(d.link ? ['', `Open it: ${site}${d.link}`] : []),
      '', `— ${d.org_name ?? 'MyBuilder'}`, `Change what you get: ${site}/settings/notifications`,
    ]
    const r = await sendMail({
      fromName: d.org_name ? `${d.org_name} via MyBuilder` : 'MyBuilder', replyTo: process.env.EMAIL_FROM ?? 'notifications@mybuilder.ca',
      to: [d.email], cc: [], subject: d.title, text: lines.join('\n'), messageId: `<ntf-${d.delivery_id}@mybuilder.ca>`,
    })
    const status = r.status === 'sent' ? 'sent' : 'failed'
    if (status === 'sent') sent++; else failed++
    await admin.rpc('finish_delivery', { p_id: d.delivery_id, p_status: status, p_error: r.error })
  }
  return NextResponse.json({ sent, failed })
}
