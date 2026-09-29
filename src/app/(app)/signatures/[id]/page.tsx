import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Ban, Download, Send } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { DecisionForm } from '@/components/kit/decision-form'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { formatDateTime, fullName } from '@/lib/utils'
import { SIG_STATUS } from '@/lib/signature-status'
import { sendSignatureRequest, signDocument, voidSignatureRequest } from '../actions'

export const metadata: Metadata = { title: 'Signature request' }

export default async function SignaturePage({ params }: PageProps<'/signatures/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: r } = await supabase.from('signature_requests').select('*').eq('id', id).maybeSingle()
  if (!r) notFound()
  const [{ data: signers }, { data: turn }] = await Promise.all([
    supabase.from('signature_request_signers').select('*').eq('request_id', id).order('sort'),
    supabase.rpc('my_signature_turn', { p_req: id }),
  ])
  const builder = ctx.workspace.mode === 'builder'
  const canEdit = builder && can(ctx, 'files', 'edit')
  const st = SIG_STATUS[r.status]
  const job = ctx.jobs.find((j) => j.id === r.job_id)
  const myTurn = r.status === 'sent' && Boolean(turn)
  const mine = (signers ?? []).find((s) => s.signed_by === ctx.userId && s.decided_at)

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost"><Link href="/signatures"><ArrowLeft />Signatures</Link></Button>
        <div className="flex gap-2">
          {r.signed_file_id && <Button asChild variant="primary"><a href={`/files/${r.signed_file_id}/download`}><Download />Signed copy</a></Button>}
          {canEdit && r.status === 'draft' && <form action={sendSignatureRequest.bind(null, id)}><ConfirmSubmit variant="primary" title="Send for signature?" confirmLabel="Send" body="Signers are notified. The document is fingerprinted so any later change to it is detectable."><Send />Send for signature</ConfirmSubmit></form>}
          {canEdit && (r.status === 'sent' || r.status === 'declined') && <form action={voidSignatureRequest.bind(null, id)}><ConfirmSubmit variant="ghost" title="Void this request?" confirmLabel="Void" body="Nobody can sign it any more. Signatures already given stay on record."><Ban />Void</ConfirmSubmit></form>}
        </div>
      </div>
      <Card className="p-5">
        <div className="text-[13px] text-text-3">{job?.title} · Signature request</div>
        <h1 className="text-xl font-semibold">{r.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-[13px]"><Badge tone={st.tone}>{st.label}</Badge>{r.in_order && <Badge>Signed in order</Badge>}{r.sent_at && <Badge>Sent {formatDateTime(r.sent_at, ctx.tz)}</Badge>}</div>
        {r.message && <p className="mt-3 whitespace-pre-wrap text-[14px]">{r.message}</p>}
      </Card>
      {mine && <Alert tone={mine.status === 'signed' ? 'success' : 'danger'}>You {mine.status === 'signed' ? 'signed' : 'declined'} this on {formatDateTime(mine.decided_at, ctx.tz)}.</Alert>}
      {r.status === 'draft' && canEdit && <Alert tone="info">This is a draft. Check the document and signers, then send it.</Alert>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <iframe title="Document" src={`/files/${r.signed_file_id ?? r.file_id}/download?inline=1`} className="h-[70vh] w-full border-0 bg-surface-2" />
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Signers" />
            <ul className="divide-y divide-border text-[13px]">
              {(signers ?? []).map((s) => (
                <li key={s.id} className="px-4 py-2">
                  <div className="flex items-center gap-2"><span className="font-medium">{r.in_order ? `${s.sort}. ` : ''}{s.label}</span>
                    <Badge tone={s.status === 'signed' ? 'success' : s.status === 'declined' ? 'danger' : 'neutral'} className="ml-auto">{s.status === 'signed' ? 'Signed' : s.status === 'declined' ? 'Declined' : 'Waiting'}</Badge></div>
                  {s.decided_at && <div className="text-xs text-text-3">{s.signer_name} · {formatDateTime(s.decided_at, ctx.tz)}{builder && s.ip ? ` · IP ${s.ip}` : ''}</div>}
                  {s.signature?.startsWith('typed:') && <div className="font-serif text-xl italic">{s.signature.slice(6)}</div>}
                  {s.signature?.startsWith('data:image/png;base64,') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.signature} alt={`Signature of ${s.signer_name}`} className="h-12" />
                  )}
                  {s.comment && <p className="text-xs text-text-2">“{s.comment}”</p>}
                </li>
              ))}
            </ul>
          </Card>
          {myTurn && (
            <Card>
              <CardHeader title="Your signature" />
              <div className="p-4">
                <DecisionForm action={signDocument.bind(null, id)} needSignature defaultName={fullName(ctx.profile)} onBehalf={false}
                  approveLabel="Sign" agreeText="I have read this document and agree to it." />
              </div>
            </Card>
          )}
          {r.file_sha256 && <p className="break-all text-[11px] text-text-3">Document fingerprint (SHA-256): {r.file_sha256}</p>}
        </div>
      </div>
    </div>
  )
}
