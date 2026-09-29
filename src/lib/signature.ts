import 'server-only'
import { headers } from 'next/headers'
import { z } from 'zod'

// Approve/decline form shared by proposals and change orders.
const decisionSchema = z.object({
  decision: z.enum(['approved', 'declined']),
  signer_name: z.string().trim().min(1, 'Enter the signer\'s full name').max(120),
  signature: z.string().max(300_000).refine((s) => s === '' || s.startsWith('typed:') || s.startsWith('data:image/png;base64,'), 'Invalid signature'),
  comment: z.string().trim().max(4000),
  agree: z.boolean(),
})

export async function parseDecision(fd: FormData) {
  const parsed = decisionSchema.safeParse({
    decision: fd.get('decision'), signer_name: fd.get('signer_name'), signature: fd.get('signature') ?? '',
    comment: fd.get('comment') ?? '', agree: fd.get('agree') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const
  const d = parsed.data
  if (d.decision === 'approved' && !d.agree) return { error: 'Confirm that you agree before approving.' } as const
  const h = await headers()
  return {
    args: {
      p_decision: d.decision, p_signer_name: d.signer_name, p_signature: d.signature, p_comment: d.comment || undefined,
      p_ip: h.get('x-real-ip') || (h.get('x-forwarded-for') ?? '').split(',').pop()?.trim() || undefined,   // the proxy's view, not what the browser claims p_ua: h.get('user-agent')?.slice(0, 400) ?? undefined,
    },
    decision: d.decision,
  } as const
}
