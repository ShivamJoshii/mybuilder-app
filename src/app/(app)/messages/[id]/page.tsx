import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Paperclip } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { formatDateTime } from '@/lib/utils'
import { reply } from '../actions'

export const metadata: Metadata = { title: 'Message' }

export default async function ThreadPage({ params }: PageProps<'/messages/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  if (ctx.workspace.mode !== 'builder') redirect('/chat')
  const supabase = await createClient()
  const { data: t } = await supabase.from('email_threads').select('*').eq('id', id).maybeSingle()
  if (!t) notFound()
  const { data: msgs } = await supabase.from('email_messages').select('*').eq('thread_id', id).order('created_at')
  const last = (msgs ?? [])[(msgs ?? []).length - 1]
  const replyTo = last ? (last.direction === 'in' ? [last.from_email] : last.to_emails) : []
  const job = ctx.jobs.find((j) => j.id === t.job_id)
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      <Button asChild variant="ghost"><Link href="/messages"><ArrowLeft />Messages</Link></Button>
      <div><div className="text-[13px] text-text-3">{job?.title}</div><h1 className="text-xl font-semibold">{t.subject}</h1></div>
      {(msgs ?? []).map((m) => (
        <Card key={m.id} className={m.direction === 'out' ? 'border-l-4 border-l-brand' : ''}>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[13px]">
            <span className="font-medium">{m.from_name || m.from_email}</span>
            <span className="text-text-3">to {m.to_emails.join(', ')}{m.cc_emails.length ? `, cc ${m.cc_emails.join(', ')}` : ''}</span>
            {m.status === 'queued' && <Badge tone="warning">Queued</Badge>}
            {m.status === 'failed' && <Badge tone="danger">Failed</Badge>}
            {m.attachments > 0 && <Badge><Paperclip className="mr-1 size-3" />{m.attachments}</Badge>}
            <span className="ml-auto text-xs text-text-3">{formatDateTime(m.created_at)}</span>
          </div>
          <p className="whitespace-pre-wrap px-4 py-3 text-[14px]">{m.body_text}</p>
        </Card>
      ))}
      {can(ctx, 'messages', 'add') && (
        <Card>
          <CardHeader title="Reply" />
          <ActionForm action={reply.bind(null, id)} className="space-y-3 p-4">
            <label className="block text-[13px] font-medium text-text-2">To<Input name="to" className="mt-1" defaultValue={replyTo.join(', ')} /></label>
            <label className="block text-[13px] font-medium text-text-2">Cc<Input name="cc" className="mt-1" defaultValue={last?.cc_emails.join(', ') ?? ''} /></label>
            <Textarea name="body" aria-label="Reply" rows={6} required maxLength={100000} />
            <Button type="submit" variant="primary">Send reply</Button>
          </ActionForm>
        </Card>
      )}
    </div>
  )
}
