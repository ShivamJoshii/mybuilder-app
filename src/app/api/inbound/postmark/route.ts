import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { inboundDomain } from '@/lib/email'

type Addr = { Email: string; Name?: string }
type Payload = {
  FromFull?: Addr; From?: string; FromName?: string; ToFull?: Addr[]; CcFull?: Addr[]; OriginalRecipient?: string
  Subject?: string; TextBody?: string; StrippedTextReply?: string; MessageID?: string
  Headers?: { Name: string; Value: string }[]; Attachments?: unknown[]
}

function authorized(req: NextRequest) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  const basic = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString().split(':')[1] ?? '' : ''
  const given = basic || req.nextUrl.searchParams.get('secret') || ''
  const a = Buffer.from(given), b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Postmark inbound webhook: files replies to job-<token>@<inbound domain> on that job. */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return new NextResponse('Unauthorized', { status: 401 })
  const p = (await req.json().catch(() => null)) as Payload | null
  if (!p) return new NextResponse('Bad request', { status: 400 })
  const domain = inboundDomain().toLowerCase()
  const recipients = [...(p.ToFull ?? []), ...(p.CcFull ?? []), ...(p.OriginalRecipient ? [{ Email: p.OriginalRecipient }] : [])].map((a) => a.Email.toLowerCase())
  const token = recipients.map((e) => e.match(new RegExp(`^job-([0-9a-f]{8,32})@${domain.replace(/\./g, '\\.')}$`))?.[1]).find(Boolean)
  if (!token) return NextResponse.json({ ok: true, skipped: 'no job address' })
  const header = (n: string) => p.Headers?.find((h) => h.Name.toLowerCase() === n.toLowerCase())?.Value ?? null
  const admin = createAdminClient()
  const { error } = await admin.rpc('ingest_inbound_email', {
    p_token: token, p_from: p.FromFull?.Email ?? p.From ?? 'unknown@unknown', p_from_name: p.FromFull?.Name ?? p.FromName ?? '',
    p_to: (p.ToFull ?? []).map((a) => a.Email), p_cc: (p.CcFull ?? []).map((a) => a.Email), p_subject: p.Subject ?? '',
    p_body: (p.StrippedTextReply?.trim() || p.TextBody || '').slice(0, 200_000), p_message_id: header('Message-ID') ?? (p.MessageID ? `<${p.MessageID}>` : ''),
    p_in_reply_to: header('In-Reply-To') ?? '', p_attachments: p.Attachments?.length ?? 0,
  })
  if (error) return new NextResponse('Error', { status: 500 })
  return NextResponse.json({ ok: true })
}
