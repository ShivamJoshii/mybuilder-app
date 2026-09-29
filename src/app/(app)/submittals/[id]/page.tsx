import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Send } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { linkedSubs, teamAndSubs } from '@/lib/financial'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { Attachments } from '@/components/kit/attachments'
import { formatDate, formatDateTime } from '@/lib/utils'
import { DECISIONS, SUBMITTAL_KINDS, SUBMITTAL_STATUS } from '@/lib/submittal'
import { SubmittalForm } from '../submittal-form'
import { requestSubmittal, reviewSubmittal, submitRevision, updateSubmittal } from '../actions'

export const metadata: Metadata = { title: 'Submittal' }

type P = { first_name: string; last_name: string } | null
const nm = (p: P) => (p ? `${p.first_name} ${p.last_name}`.trim() : '')

export default async function SubmittalPage({ params }: PageProps<'/submittals/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: s } = await supabase.from('submittals')
    .select('*, sub:organizations!submittals_submitter_sub_org_id_fkey(name), reviewer:profiles!submittals_reviewer_user_id_fkey(first_name,last_name)')
    .eq('id', id).is('deleted_at', null).maybeSingle()
  if (!s) notFound()
  const { data: revs } = await supabase.from('submittal_revisions').select('*, by:profiles!submittal_revisions_submitted_by_fkey(first_name,last_name), dec:profiles!submittal_revisions_decided_by_fkey(first_name,last_name)')
    .eq('submittal_id', id).order('revision', { ascending: false })
  const builder = ctx.workspace.mode === 'builder'
  const canEdit = builder && can(ctx, 'submittals', 'edit')
  const mySub = !builder && s.submitter_sub_org_id != null && ctx.orgs.some((o) => o.org_id === s.submitter_sub_org_id)
  const reviewer = s.reviewer_user_id === ctx.userId || canEdit
  const st = SUBMITTAL_STATUS[s.status]
  const canSubmit = ['requested', 'revise'].includes(s.status) && (mySub || canEdit)
  const job = ctx.jobs.find((j) => j.id === s.job_id)
  const ballLabel = st.ball === 'sub' ? (s.sub as { name: string } | null)?.name ?? 'the sub' : st.ball === 'reviewer' ? nm(s.reviewer as P) || 'the reviewer' : st.ball === 'builder' ? 'the builder' : null
  const [subs, people] = canEdit && s.status === 'draft' ? await Promise.all([linkedSubs(s.org_id), teamAndSubs(s.org_id)]) : [[], []]

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-5">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost"><Link href="/submittals"><ArrowLeft />Submittals</Link></Button>
        {canEdit && s.status === 'draft' && s.submitter_sub_org_id && <form action={requestSubmittal.bind(null, id)}><Button type="submit" variant="primary"><Send />Request from sub</Button></form>}
      </div>
      <Card className="p-5">
        <div className="text-[13px] text-text-3">{job?.title} · Submittal #{s.number}{s.spec_section ? ` · ${s.spec_section}` : ''} · {SUBMITTAL_KINDS[s.kind]}</div>
        <h1 className="text-xl font-semibold">{s.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
          <Badge tone={st.tone}>{st.label}{s.status !== 'draft' && s.status !== 'requested' ? ` · rev ${s.revision}` : ''}</Badge>
          {ballLabel && <Badge tone="warning">Ball in court: {ballLabel}</Badge>}
          {s.due_date && <Badge>Due {formatDate(s.due_date)}</Badge>}
          {s.required_on_site && <Badge>Needed on site {formatDate(s.required_on_site)}</Badge>}
          {(s.sub as { name: string } | null)?.name && <Badge>From {(s.sub as { name: string }).name}</Badge>}
          {nm(s.reviewer as P) && <Badge>Reviewer {nm(s.reviewer as P)}</Badge>}
        </div>
        {s.description && <p className="mt-3 whitespace-pre-wrap text-[14px]">{s.description}</p>}
      </Card>

      {canEdit && s.status === 'draft' && (
        <Card className="p-5">
          <SubmittalForm action={updateSubmittal.bind(null, id)} subs={subs} team={people.filter((p) => p.group === 'Team').map((p) => ({ value: p.value.slice(2), label: p.label }))}
            defaults={{ title: s.title, spec_section: s.spec_section ?? '', kind: s.kind, description: s.description ?? '', submitter: s.submitter_sub_org_id ?? '', reviewer: s.reviewer_user_id ?? '', due_date: s.due_date ?? '', required_on_site: s.required_on_site ?? '' }} />
        </Card>
      )}

      {canSubmit && (
        <Card>
          <CardHeader title={`Submit revision ${(revs ?? []).length}`} description="Add a note, submit, then attach the drawings or product data to the revision." />
          <ActionForm action={submitRevision.bind(null, id)} className="space-y-3 p-4">
            <Textarea name="notes" aria-label="Submission notes" rows={3} maxLength={8000} placeholder="What’s included, what changed since the last revision" />
            <Button type="submit" variant="primary"><Send />Submit for review</Button>
          </ActionForm>
        </Card>
      )}

      {s.status === 'submitted' && reviewer && (
        <Card>
          <CardHeader title={`Review revision ${s.revision}`} />
          <ActionForm action={reviewSubmittal.bind(null, id)} className="space-y-3 p-4">
            <Select name="decision" aria-label="Decision" defaultValue="" required className="max-w-xs"><option value="" disabled>Decision…</option>{Object.entries(DECISIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Textarea name="notes" aria-label="Review notes" rows={3} maxLength={8000} placeholder="Required for anything other than Approved" />
            <Button type="submit" variant="primary">Save review</Button>
          </ActionForm>
        </Card>
      )}

      {(revs ?? []).map((r) => (
        <div key={r.id} className="space-y-2">
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[13px]">
              <span className="font-medium">Revision {r.revision}</span>
              <span className="text-text-3">submitted by {nm(r.by as P)} · {formatDateTime(r.submitted_at, ctx.tz)}</span>
              {r.decision && <Badge tone={r.decision.startsWith('approved') ? 'success' : 'danger'} className="ml-auto">{DECISIONS[r.decision]}</Badge>}
            </div>
            {r.notes && <p className="whitespace-pre-wrap px-4 py-2 text-[13px]">{r.notes}</p>}
            {r.decision && <div className="border-t border-border bg-surface-2 px-4 py-2 text-[13px]"><span className="font-medium">{nm(r.dec as P)}:</span> {r.decision_notes || DECISIONS[r.decision]} <span className="text-xs text-text-3">· {formatDateTime(r.decided_at, ctx.tz)}</span></div>}
          </Card>
          <Attachments jobId={s.job_id} recordType="submittal_revision" recordId={r.id} path={`/submittals/${id}`} share={{ subs: true, clients: false }}
            canAdd={!r.decision && (mySub || canEdit)} />
        </div>
      ))}
    </div>
  )
}
