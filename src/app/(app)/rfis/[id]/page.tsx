import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, RotateCcw, Send } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { describeLinks } from '@/lib/related'
import { recordHref, recordLabel } from '@/lib/records'
import { RFI_STATUS } from '@/lib/rfi'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { timeAgo } from '@/components/kit/comments'
import { Attachments } from '@/components/kit/attachments'
import { formatDate, initials } from '@/lib/utils'
import { rfiStatus, respond } from '../actions'
import { CustomFields } from '@/components/kit/custom-fields'

export const metadata: Metadata = { title: 'RFI' }

type P = { first_name: string; last_name: string; email: string } | null
const nm = (p: P) => (p ? `${p.first_name} ${p.last_name}`.trim() || p.email : '')

export default async function RfiPage({ params }: PageProps<'/rfis/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: r } = await supabase.from('rfis')
    .select(`*, assignee:profiles!rfis_assignee_user_id_fkey(first_name,last_name,email),
             assignee_org:organizations!rfis_assignee_sub_org_id_fkey(name),
             creator:profiles!rfis_created_by_fkey(first_name,last_name,email)`).eq('id', id).maybeSingle()
  if (!r) notFound()
  const [{ data: responses }, { data: links }] = await Promise.all([
    supabase.from('rfi_responses').select('id,body,created_at,profiles(first_name,last_name,email)').eq('rfi_id', id).order('created_at'),
    supabase.from('related_items').select('to_type,to_id').eq('from_type', 'rfi').eq('from_id', id),
  ])
  const labels = await describeLinks(links ?? [])
  const visibleLinks = (links ?? []).filter((l) => labels.has(l.to_id))
  const myOrgs = ctx.orgs.map((o) => o.org_id)
  const isAssignee = r.assignee_user_id === ctx.userId || (r.assignee_sub_org_id != null && myOrgs.includes(r.assignee_sub_org_id))
  const isCreator = r.created_by === ctx.userId
  const editor = ctx.workspace.mode === 'builder' && can(ctx, 'rfis', 'edit')
  const st = RFI_STATUS[r.status]
  const open = r.status === 'sent' || r.status === 'reopened'

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost"><Link href="/rfis"><ArrowLeft />RFIs</Link></Button>
        <div className="flex gap-2">
          {r.status === 'not_sent' && (isCreator || editor) && <form action={rfiStatus.bind(null, id, 'send')}><Button type="submit" variant="primary"><Send />Send</Button></form>}
          {open && (isCreator || editor || isAssignee) && <form action={rfiStatus.bind(null, id, 'complete')}><Button type="submit"><CheckCircle2 />Mark complete</Button></form>}
          {r.status === 'completed' && (isCreator || editor) && <form action={rfiStatus.bind(null, id, 'reopen')}><Button type="submit"><RotateCcw />Reopen</Button></form>}
        </div>
      </div>
      <Card>
        <div className="border-b border-border p-4">
          <div className="text-[13px] text-text-3"><Link href={`/jobs/${r.job_id}`} className="hover:underline">{ctx.jobs.find((j) => j.id === r.job_id)?.title}</Link> · RFI #{r.number}</div>
          <h1 className="text-xl font-semibold">{r.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
            <Badge tone={st.tone}>{st.label}</Badge>
            <Badge>Due {formatDate(r.due_date)}</Badge>
            <Badge>Assigned to {r.assignee ? nm(r.assignee as P) : (r.assignee_org as { name: string } | null)?.name ?? 'the builder'}</Badge>
          </div>
        </div>
        <div className="p-4">
          <div className="mb-1 text-xs font-medium text-text-3">Question from {nm(r.creator as P)}{r.author_type === 'sub' ? ' (sub/vendor)' : ''}</div>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{r.question}</p>
        </div>
        {visibleLinks.length > 0 && (
          <div className="border-t border-border p-4">
            <div className="mb-2 text-xs font-medium text-text-3">Related items</div>
            <ul className="space-y-1 text-[13px]">
              {visibleLinks.map((l) => (
                <li key={l.to_id}><Badge>{recordLabel(l.to_type)}</Badge> <Link href={recordHref(l.to_type, r.job_id, l.to_id)} className="text-brand hover:underline">{labels.get(l.to_id)}</Link></li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <CustomFields module="rfis" recordId={id} orgId={r.org_id} path={`/rfis/${id}`} canEdit={editor} audience={ctx.workspace.mode === 'builder' ? 'internal' : ctx.workspace.mode} />
      <Attachments jobId={r.job_id} recordType="rfi" recordId={id} path={`/rfis/${id}`} share={{ subs: r.assignee_sub_org_id != null || r.author_type === 'sub', clients: false }} canAdd={isCreator || editor || isAssignee} />
      <Card>
        <CardHeader title="Responses" description={r.status === 'not_sent' ? 'Send the RFI to start collecting responses.' : undefined} />
        <ul className="divide-y divide-border">
          {(responses ?? []).map((x) => (
            <li key={x.id} className="flex gap-3 px-4 py-3">
              <Avatar text={initials(x.profiles as P)} />
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="flex gap-2"><span className="font-medium">{nm(x.profiles as P)}</span><span className="text-xs text-text-3">{timeAgo(x.created_at)}</span></div>
                <p className="mt-1 whitespace-pre-wrap">{x.body}</p>
              </div>
            </li>
          ))}
          {(responses ?? []).length === 0 && <li className="px-4 py-3 text-[13px] text-text-3">No responses yet.</li>}
        </ul>
        {open && (
          <ActionForm action={respond.bind(null, id)} className="border-t border-border p-4">
            <Textarea name="body" aria-label="Write a response" placeholder="Write a response" required maxLength={10000} />
            <div className="mt-2 flex justify-end"><Button type="submit" variant="primary" size="sm">Post response</Button></div>
          </ActionForm>
        )}
      </Card>
    </div>
  )
}
