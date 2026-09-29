import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Hammer, Pencil, Trash2, XCircle } from 'lucide-react'
import { requireBuilder, can, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchLookups, ageDays, revenue, ACTIVITY_TYPES } from '@/lib/leads'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { ActionForm } from '@/components/kit/action-form'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { formatDate, todayIn } from '@/lib/utils'
import { StatusSelect } from '../status-select'
import { addActivity, completeActivity, convertLead, deleteLead, markLost } from '../actions'
import { CustomFields } from '@/components/kit/custom-fields'

export const metadata: Metadata = { title: 'Lead' }

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-3 px-4 py-2 text-[13px]"><dt className="text-text-3">{k}</dt><dd className="col-span-2">{v || <span className="text-text-3">—</span>}</dd></div>
}

export default async function LeadPage({ params }: PageProps<'/leads/[id]'>) {
  const { id } = await params
  const ctx = await requireBuilder('leads')
  const supabase = await createClient()
  const { data: lead } = await supabase.from('leads').select('*, lead_salespeople(user_id)').eq('id', id).maybeSingle()
  if (!lead) notFound()
  const [l, { data: acts }] = await Promise.all([
    fetchLookups(ctx.workspace.orgId),
    supabase.from('lead_activities').select('*, assignee:profiles!lead_activities_assigned_to_fkey(first_name,last_name)').eq('lead_id', id).order('activity_date', { ascending: false }).order('created_at', { ascending: false }),
  ])
  const status = l.statuses.find((s) => s.id === lead.status_id)
  const names = (ids: string[], list: { id: string; name: string }[]) => ids.map((x) => list.find((y) => y.id === x)?.name).filter(Boolean).join(', ')
  const canEdit = can(ctx, 'leads', 'edit')
  const canConvert = hasAction(ctx, 'leads.convert') && !lead.converted_job_id
  const typeLabel = new Map<string, string>(ACTIVITY_TYPES.map((t) => [t.value, t.label]))

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost"><Link href="/leads"><ArrowLeft />Leads</Link></Button>
        <div className="flex flex-wrap gap-2">
          {can(ctx, 'leads', 'delete') && <form action={deleteLead.bind(null, id)}><ConfirmSubmit variant="ghost" title="Delete this lead?" body="Its activities are deleted too."><Trash2 />Delete</ConfirmSubmit></form>}
          {canEdit && status?.category === 'open' && (
            <Dialog>
              <DialogTrigger asChild><Button><XCircle />Mark lost</Button></DialogTrigger>
              <DialogContent title="Mark as lost">
                <ActionForm action={markLost.bind(null, id)} className="space-y-3 p-4">
                  <Field label="Reason" htmlFor="lost_reason_id"><Select id="lost_reason_id" name="lost_reason_id">{l.lostReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
                  <Field label="Notes" htmlFor="lost_notes"><Textarea id="lost_notes" name="lost_notes" /></Field>
                  <Button type="submit" variant="danger">Mark lost</Button>
                </ActionForm>
              </DialogContent>
            </Dialog>
          )}
          {canEdit && <Button asChild><Link href={`/leads/${id}/edit`}><Pencil />Edit</Link></Button>}
          {canConvert && (
            <Dialog>
              <DialogTrigger asChild><Button variant="primary"><Hammer />Convert to job</Button></DialogTrigger>
              <DialogContent title="Convert to job" description="Creates a Presale job with this site address and adds the contact as the client.">
                <ActionForm action={convertLead.bind(null, id)} className="space-y-3 p-4">
                  <Field label="Job name" htmlFor="cv_title" required><Input id="cv_title" name="title" defaultValue={lead.title} required /></Field>
                  <Field label="Contract type" htmlFor="cv_ct"><Select id="cv_ct" name="contract_type"><option value="fixed_price">Fixed price</option><option value="open_book">Open book (cost plus)</option></Select></Field>
                  <Field label="Contract price (CAD)" htmlFor="cv_amt"><Input id="cv_amt" name="amount" type="number" min={0} step="0.01" defaultValue={lead.est_revenue_max ?? lead.est_revenue_min ?? ''} /></Field>
                  <Button type="submit" variant="primary">Create job</Button>
                </ActionForm>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h1 className="text-xl font-semibold">{lead.title}</h1>
            <div className="mt-1 flex flex-wrap gap-2 text-[13px]">
              <Badge>{ageDays(lead.created_at)} days old</Badge>
              {lead.converted_job_id && <Link href={`/jobs/${lead.converted_job_id}`}><Badge tone="success">Converted to job →</Badge></Link>}
              {lead.lost_at && <Badge tone="danger">Lost {lead.lost_reason_id ? `· ${l.lostReasons.find((r) => r.id === lead.lost_reason_id)?.name}` : ''}</Badge>}
            </div>
          </div>
          {canEdit ? <StatusSelect id={id} value={lead.status_id} statuses={l.statuses} /> : <Badge>{status?.name}</Badge>}
        </div>
        <div className="grid md:grid-cols-2">
          <dl className="divide-y divide-border border-border md:border-r">
            <Row k="Contact" v={`${lead.contact_first} ${lead.contact_last}`.trim()} />
            <Row k="Email" v={lead.contact_email && <a className="text-brand hover:underline" href={`mailto:${lead.contact_email}`}>{lead.contact_email}</a>} />
            <Row k="Phone" v={lead.contact_phone && <a className="text-brand hover:underline" href={`tel:${lead.contact_phone}`}>{lead.contact_phone}</a>} />
            <Row k="Job site" v={[lead.site_street, lead.site_city, lead.site_province, lead.site_postal].filter(Boolean).join(', ')} />
          </dl>
          <dl className="divide-y divide-border">
            <Row k="Salespeople" v={names((lead.lead_salespeople ?? []).map((s: { user_id: string }) => s.user_id), l.salespeople)} />
            <Row k="Estimated revenue" v={revenue(lead.est_revenue_min == null ? null : Number(lead.est_revenue_min), lead.est_revenue_max == null ? null : Number(lead.est_revenue_max))} />
            <Row k="Confidence" v={lead.confidence == null ? null : `${lead.confidence}%`} />
            <Row k="Projected sale" v={formatDate(lead.projected_sale_date)} />
            <Row k="Source" v={names(lead.source_ids, l.sources)} />
            <Row k="Project type" v={names(lead.project_type_ids, l.types)} />
          </dl>
        </div>
        {lead.notes && <p className="whitespace-pre-wrap border-t border-border p-4 text-[13px]">{lead.notes}</p>}
      </Card>

      <Card>
        <CardHeader title="Activities" description="Calls, emails, meetings and follow-ups" />
        <ul className="divide-y divide-border">
          {(acts ?? []).map((a) => {
            const who = a.assignee as { first_name: string; last_name: string } | null
            return (
              <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                {canEdit ? (
                  <form action={completeActivity.bind(null, a.id, id, !a.completed_at)}>
                    <button type="submit" aria-label={a.completed_at ? 'Mark not done' : 'Mark done'} className={`mt-0.5 size-4 rounded border ${a.completed_at ? 'border-success bg-success' : 'border-border-strong'}`} />
                  </form>
                ) : <span className="mt-0.5 size-4" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{typeLabel.get(a.type)}</Badge>
                    <span className={`font-medium ${a.completed_at ? 'text-text-3' : ''}`}>{a.title}</span>
                    {a.initiated_by === 'lead' && <span className="text-xs text-text-3">from the lead</span>}
                  </div>
                  {a.description && <p className="mt-0.5 whitespace-pre-wrap text-text-2">{a.description}</p>}
                </div>
                <div className="text-right text-xs text-text-3">
                  <div>{formatDate(a.activity_date)}{a.start_time ? ` ${a.start_time.slice(0, 5)}` : ''}</div>
                  {who && <div>{who.first_name} {who.last_name}</div>}
                </div>
              </li>
            )
          })}
          {(acts ?? []).length === 0 && <li className="px-4 py-3 text-[13px] text-text-3">No activity yet.</li>}
        </ul>
        {can(ctx, 'leads', 'add') && (
          <ActionForm action={addActivity.bind(null, id)} className="grid gap-3 border-t border-border p-4 sm:grid-cols-4">
            <Field label="Type" htmlFor="a_type"><Select id="a_type" name="type">{ACTIVITY_TYPES.filter((t) => t.value !== 'website_form').map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
            <Field label="Date" htmlFor="a_date"><Input id="a_date" name="activity_date" type="date" defaultValue={todayIn()} required /></Field>
            <Field label="Time" htmlFor="a_time"><Input id="a_time" name="start_time" type="time" /></Field>
            <Field label="Assigned to" htmlFor="a_to"><Select id="a_to" name="assigned_to" defaultValue={ctx.userId}>{l.salespeople.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Subject" htmlFor="a_title" className="sm:col-span-4"><Input id="a_title" name="title" maxLength={120} /></Field>
            <Field label="Details" htmlFor="a_desc" className="sm:col-span-4"><Textarea id="a_desc" name="description" className="min-h-16" /></Field>
            <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" name="done" className="accent-brand" />Already happened (log it)</label>
            <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" name="initiated_by" value="lead" className="accent-brand" />The lead reached out</label>
            <div className="sm:col-span-4"><Button type="submit" variant="primary">Save activity</Button></div>
          </ActionForm>
        )}
      </Card>
      <CustomFields module="leads" recordId={id} orgId={lead.org_id} path={`/leads/${id}`} canEdit={canEdit} />
    </div>
  )
}
