import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarPlus, Check, CheckCircle2, Star, X } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { teamAndSubs } from '@/lib/financial'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Input, Select, Textarea } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { Attachments } from '@/components/kit/attachments'
import { CommentThread } from '@/components/kit/comments'
import { formatDate, formatDateTime } from '@/lib/utils'
import { APPT_STATUS, CLAIM_CATEGORIES, CLAIM_STATUS, PRIORITY } from '@/lib/warranty'
import { addAppointment, leaveFeedback, updateAppointment, updateClaim } from '../actions'

export const metadata: Metadata = { title: 'Warranty claim' }

type Who = { first_name: string; last_name: string } | null
const nm = (p: Who) => (p ? `${p.first_name} ${p.last_name}`.trim() : '')

export default async function ClaimPage({ params }: PageProps<'/warranty/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: c } = await supabase.from('warranty_claims')
    .select('*, assignee:profiles!warranty_claims_assignee_user_id_fkey(first_name,last_name), assignee_org:organizations!warranty_claims_assignee_sub_org_id_fkey(name), creator:profiles!warranty_claims_created_by_fkey(first_name,last_name)')
    .eq('id', id).is('deleted_at', null).maybeSingle()
  if (!c) notFound()
  const mode = ctx.workspace.mode
  const builder = mode === 'builder'
  const canEdit = builder && can(ctx, 'warranties', 'edit')
  const [{ data: appts }, { data: notes }] = await Promise.all([
    supabase.from('warranty_appointments').select('*, tech:profiles!warranty_appointments_assignee_user_id_fkey(first_name,last_name), tech_org:organizations!warranty_appointments_assignee_sub_org_id_fkey(name)').eq('claim_id', id).order('starts_at'),
    builder ? supabase.from('warranty_claim_notes').select('internal_notes').eq('claim_id', id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const people = canEdit ? await teamAndSubs(c.org_id) : []
  const myOrgs = new Set(ctx.orgs.map((o) => o.org_id))
  const job = ctx.jobs.find((j) => j.id === c.job_id)
  const st = CLAIM_STATUS[c.status]
  const assigned = (c.assignee_org as { name: string } | null)?.name ?? nm(c.assignee as Who)
  const assigneeValue = c.assignee_sub_org_id ? `s:${c.assignee_sub_org_id}` : c.assignee_user_id ? `u:${c.assignee_user_id}` : ''
  const peopleSelect = (name: string, value: string, label: string) => (
    <Select name={name} aria-label={label} defaultValue={value} className="mt-1">
      <option value="">Nobody</option>
      {['Team', 'Subs and vendors'].map((g) => <optgroup key={g} label={g}>{people.filter((p) => p.group === g).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</optgroup>)}
    </Select>
  )

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-5">
      <Button asChild variant="ghost"><Link href="/warranty"><ArrowLeft />Warranty</Link></Button>
      <Card className="p-5">
        <div className="text-[13px] text-text-3">{job?.title} · Claim #{c.number}{c.location ? ` · ${c.location}` : ''}</div>
        <h1 className="text-xl font-semibold">{c.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
          <Badge tone={st.tone}>{st.label}</Badge>
          {c.priority !== 'normal' && <Badge tone={PRIORITY[c.priority].tone}>{PRIORITY[c.priority].label}</Badge>}
          {c.category && <Badge>{c.category}</Badge>}
          <Badge>Reported {formatDate(c.created_at)}{c.submitted_by_client ? ' by the homeowner' : ''}</Badge>
          {assigned && <Badge>Assigned to {assigned}</Badge>}
        </div>
        {c.description && <p className="mt-3 whitespace-pre-wrap text-[14px]">{c.description}</p>}
        {c.client_rating && (
          <div className="mt-4 rounded-md border border-border p-3 text-[13px]">
            <div className="flex items-center gap-1 text-warning">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={`size-4 ${i < c.client_rating! ? 'fill-current' : ''}`} />)}</div>
            {c.client_feedback && <p className="mt-1">{c.client_feedback}</p>}
            <div className="text-xs text-text-3">Homeowner feedback · {formatDate(c.feedback_at)}</div>
          </div>
        )}
      </Card>

      {canEdit && (
        <Card>
          <CardHeader title="Manage claim" />
          <ActionForm action={updateClaim.bind(null, id)} resetOnSuccess={false} className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="text-[13px] font-medium text-text-2 sm:col-span-2">Title<Input name="title" className="mt-1" defaultValue={c.title} required maxLength={200} /></label>
            <label className="text-[13px] font-medium text-text-2">Status
              <Select name="status" className="mt-1" defaultValue={c.status}>{Object.entries(CLAIM_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
            </label>
            <label className="text-[13px] font-medium text-text-2">Priority
              <Select name="priority" className="mt-1" defaultValue={c.priority}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
            </label>
            <label className="text-[13px] font-medium text-text-2">Category<Input name="category" className="mt-1" list="wc-cats" defaultValue={c.category ?? ''} maxLength={60} /><datalist id="wc-cats">{CLAIM_CATEGORIES.map((x) => <option key={x} value={x} />)}</datalist></label>
            <label className="text-[13px] font-medium text-text-2">Location<Input name="location" className="mt-1" defaultValue={c.location ?? ''} maxLength={80} /></label>
            <label className="text-[13px] font-medium text-text-2">Assigned to{peopleSelect('assignee', assigneeValue, 'Assigned to')}</label>
            <label className="text-[13px] font-medium text-text-2 sm:col-span-2">Description<Textarea name="description" className="mt-1" rows={3} defaultValue={c.description ?? ''} maxLength={8000} /></label>
            <label className="text-[13px] font-medium text-text-2 sm:col-span-2">Internal notes (your team only)<Textarea name="internal_notes" className="mt-1" rows={2} defaultValue={notes?.internal_notes ?? ''} maxLength={8000} /></label>
            <div><Button type="submit" variant="primary">Save claim</Button></div>
          </ActionForm>
        </Card>
      )}

      <Card>
        <CardHeader title="Service appointments" />
        <ul className="divide-y divide-border text-[13px]">
          {(appts ?? []).map((a) => {
            const as = APPT_STATUS[a.status]
            const mine = (a.assignee_sub_org_id && myOrgs.has(a.assignee_sub_org_id)) || a.assignee_user_id === ctx.userId
            const tech = (a.tech_org as { name: string } | null)?.name ?? nm(a.tech as Who)
            const open = a.status === 'scheduled' || a.status === 'confirmed'
            return (
              <li key={a.id} className="space-y-2 px-4 py-3" data-appt={a.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{formatDateTime(a.starts_at)}</span>
                  {tech && <span className="text-text-3">· {tech}</span>}
                  <Badge tone={as.tone}>{as.label}</Badge>
                  <div className="ml-auto flex gap-2">
                    {open && a.status === 'scheduled' && (mine || canEdit) && <form action={updateAppointment.bind(null, id, a.id, 'confirmed')}><Button type="submit" size="sm"><Check />Confirm</Button></form>}
                    {open && canEdit && <form action={updateAppointment.bind(null, id, a.id, 'missed')}><Button type="submit" size="sm" variant="ghost">Missed</Button></form>}
                    {open && canEdit && <form action={updateAppointment.bind(null, id, a.id, 'cancelled')}><Button type="submit" size="sm" variant="ghost" aria-label="Cancel appointment"><X /></Button></form>}
                  </div>
                </div>
                {a.notes && <p className="text-text-2">{a.notes}</p>}
                {a.work_notes && <p className="rounded bg-surface-2 px-2 py-1"><span className="font-medium">Work done: </span>{a.work_notes}</p>}
                {open && (mine || canEdit) && (
                  <form action={updateAppointment.bind(null, id, a.id, 'completed')} className="flex flex-wrap gap-2">
                    <Input name="work_notes" aria-label="What was done" placeholder="What was done?" className="max-w-md" maxLength={4000} />
                    <Button type="submit" size="sm" variant="primary"><CheckCircle2 />Mark complete</Button>
                  </form>
                )}
              </li>
            )
          })}
          {(appts ?? []).length === 0 && <li className="px-4 py-3 text-text-3">No visits booked yet.</li>}
        </ul>
        {canEdit && c.status !== 'closed' && (
          <ActionForm action={addAppointment.bind(null, id)} className="grid gap-3 border-t border-border p-4 sm:grid-cols-4">
            <label className="text-[13px] font-medium text-text-2 sm:col-span-2">When (Mountain time)<Input name="starts" type="datetime-local" className="mt-1" required /></label>
            <label className="text-[13px] font-medium text-text-2">Hours<Input name="hours" type="number" step="0.25" min="0.25" max="24" defaultValue="2" className="mt-1" /></label>
            <label className="text-[13px] font-medium text-text-2">Who{peopleSelect('assignee', assigneeValue, 'Technician')}</label>
            <label className="text-[13px] font-medium text-text-2 sm:col-span-3">Notes for the visit<Input name="notes" className="mt-1" maxLength={4000} /></label>
            <div className="self-end"><Button type="submit"><CalendarPlus />Book visit</Button></div>
          </ActionForm>
        )}
      </Card>

      {mode === 'client' && ['resolved', 'closed'].includes(c.status) && !c.client_rating && (
        <Card>
          <CardHeader title="How did we do?" />
          <ActionForm action={leaveFeedback.bind(null, id)} className="space-y-3 p-4">
            <div className="flex gap-3 text-[13px]" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => <label key={n} className="flex items-center gap-1"><input type="radio" name="rating" value={n} className="accent-brand" required /> {n}</label>)}
            </div>
            <Textarea name="feedback" aria-label="Feedback" rows={2} maxLength={4000} placeholder="Anything we should know?" />
            <Button type="submit" variant="primary">Send feedback</Button>
          </ActionForm>
        </Card>
      )}
      {c.status === 'resolved' && mode === 'client' && c.client_rating && <Alert tone="success">Thanks — your feedback was sent.</Alert>}

      <Attachments jobId={c.job_id} recordType="warranty_claim" recordId={id} path={`/warranty/${id}`} share={{ subs: Boolean(c.assignee_sub_org_id), clients: true }} canAdd={canEdit || (mode === 'client' && c.status !== 'closed')} />
      <CommentThread jobId={c.job_id} recordType="warranty_claim" recordId={id} mode={mode} path={`/warranty/${id}`} />
    </div>
  )
}
