import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CopyPlus, LayoutTemplate, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchInternalUsers } from '@/lib/jobs'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, JobStatusBadge } from '@/components/ui/badge'
import { Field, Input, Select } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { ActionForm } from '@/components/kit/action-form'
import { formatCAD, formatDate } from '@/lib/utils'
import { CopyButton } from '@/components/kit/copy-button'
import { addJobSub, removeJobSub, addJobClient, inviteJobClient, removeJobClient, setJobMember, deleteJob, saveAsTemplate, saveJobPortal } from '../actions'
import { AddClientForm } from './client-form'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { CommentThread } from '@/components/kit/comments'
import { CustomFields } from '@/components/kit/custom-fields'
import { ClientMoney } from '@/components/kit/client-money'
import { PortalSettingsFields } from '@/components/kit/portal-settings-fields'

export const metadata: Metadata = { title: 'Job' }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 px-4 py-2 text-[13px]">
      <dt className="text-text-3">{label}</dt>
      <dd className="col-span-2">{children || <span className="text-text-3">—</span>}</dd>
    </div>
  )
}

export default async function JobPage({ params }: PageProps<'/jobs/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: job } = await supabase.from('jobs').select('*, job_sub_notes(body)').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!job) notFound()

  const isBuilder = ctx.workspace.mode === 'builder'
  const builderName = ctx.jobs.find((j) => j.id === id)?.builder_name ?? (ctx.workspace.mode === 'builder' ? ctx.workspace.orgName : '')
  const [{ data: priv }, { data: mgrs }] = await Promise.all([
    supabase.from('job_private').select('contract_price,internal_notes').eq('job_id', id).maybeSingle(),
    supabase.from('job_managers').select('user_id, profiles(first_name,last_name,email,phone)').eq('job_id', id),
  ])
  const managers = (mgrs ?? []).map((m) => m.profiles as { first_name: string; last_name: string; email: string; phone: string | null } | null)
    .filter(Boolean).map((p) => ({ name: `${p!.first_name} ${p!.last_name}`.trim() || p!.email, email: p!.email, phone: p!.phone }))
  const address = [job.street, job.city, job.province, job.postal_code].filter(Boolean).join(', ')

  // Builder-only panels
  let subs: { sub_org_id: string; company_name: string; trade: string | null; flags: string[] }[] = []
  let linkable: { sub_org_id: string; company_name: string; trade: string | null }[] = []
  let clients: { id: string; name: string; email: string | null; phone: string | null; invited_at: string | null; user_id: string | null }[] = []
  let clientInvite = new Map<string, string>()
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  let team: { user_id: string; name: string; role_name: string; all_jobs: boolean; on_job: boolean }[] = []
  if (isBuilder) {
    const [{ data: js }, { data: links }, { data: jc }, users, { data: jm }] = await Promise.all([
      supabase.from('job_subs').select('*').eq('job_id', id),
      supabase.from('builder_sub_links').select('sub_org_id,company_name,trade,status').eq('builder_org_id', job.org_id),
      supabase.from('job_clients').select('*').eq('job_id', id).order('created_at'),
      fetchInternalUsers(job.org_id),
      supabase.from('job_members').select('user_id').eq('job_id', id),
    ])
    const { data: cinv } = jc?.length
      ? await supabase.from('invites').select('job_client_id,token').eq('kind', 'client').is('accepted_at', null).in('job_client_id', jc.map((c) => c.id))
      : { data: [] }
    clientInvite = new Map((cinv ?? []).map((i) => [i.job_client_id!, i.token]))
    const linkMap = new Map((links ?? []).map((l) => [l.sub_org_id, l]))
    subs = (js ?? []).map((s) => ({
      sub_org_id: s.sub_org_id,
      company_name: linkMap.get(s.sub_org_id)?.company_name ?? 'Unknown',
      trade: linkMap.get(s.sub_org_id)?.trade ?? null,
      flags: [s.can_view_owner_info && 'Sees owner info', s.can_share_with_client && 'Shares with client',
              s.can_assign_rfis_to_subs && 'Assigns RFIs', s.see_all_schedule_items && 'Sees full schedule'].filter(Boolean) as string[],
    }))
    const onJob = new Set(subs.map((s) => s.sub_org_id))
    linkable = (links ?? []).filter((l) => l.status === 'active' && !onJob.has(l.sub_org_id))
    clients = (jc ?? []).map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim(), email: c.email, phone: c.phone, invited_at: c.invited_at, user_id: c.user_id }))
    const members = new Set((jm ?? []).map((m) => m.user_id))
    team = users.filter((u) => u.status === 'active').map((u) => ({ user_id: u.user_id, name: u.name, role_name: u.role_name, all_jobs: u.all_jobs, on_job: members.has(u.user_id) }))
  }

  const canEdit = isBuilder && can(ctx, 'jobs', 'edit')
  const portal = canEdit ? await portalSettings(id, job.org_id) : {}
  // clients see the PM's contact details only if the builder allows it
  const showPm = ctx.workspace.mode !== 'client' || (await supabase.rpc('client_can', { p_job: id, p_key: 'pm_contact' })).data !== false
  let subCanShare = false
  if (ctx.workspace.mode === 'sub') {
    const { data: mine } = await supabase.from('job_subs').select('can_share_with_client').eq('job_id', id).eq('sub_org_id', ctx.workspace.subOrgId).maybeSingle()
    subCanShare = Boolean(mine?.can_share_with_client)
  }
  return (
    <div className="mx-auto max-w-6xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="size-3 rounded-full" style={{ background: job.color }} />
          <h1 className="text-xl font-semibold tracking-tight">{job.title}</h1>
          {job.is_template ? <Badge tone="brand">Template</Badge> : <JobStatusBadge status={job.status} />}
        </div>
        {isBuilder && (
          <div className="flex flex-wrap gap-2">
            {job.is_template && can(ctx, 'jobs', 'add') && <Button asChild><Link href={`/jobs/new?template=${id}`}><CopyPlus />New job from template</Link></Button>}
            {!job.is_template && can(ctx, 'jobs', 'add') && (
              <Dialog>
                <DialogTrigger asChild><Button variant="ghost"><LayoutTemplate />Save as template</Button></DialogTrigger>
                <DialogContent title="Save as template" description="Copies the schedule, to-dos, selections, specs, estimate and folders. Subs, clients, files and money stay behind.">
                  <ActionForm action={saveAsTemplate.bind(null, id)} className="space-y-3 p-4">
                    <Field label="Template name" htmlFor="tpl_title" required><Input id="tpl_title" name="title" required maxLength={120} defaultValue={`${job.title} template`} /></Field>
                    <Button type="submit" variant="primary">Save template</Button>
                  </ActionForm>
                </DialogContent>
              </Dialog>
            )}
            {can(ctx, 'jobs', 'delete') && (
              <form action={deleteJob.bind(null, id)}>
                <ConfirmSubmit variant="ghost" title="Delete this job?" body="The job moves to the trash. Subs and clients lose access right away."><Trash2 />Delete</ConfirmSubmit>
              </form>
            )}
            {canEdit && <Button asChild variant="primary"><Link href={`/jobs/${id}/edit`}><Pencil />Edit job</Link></Button>}
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Job information" />
            <dl className="divide-y divide-border">
              <Row label="Builder">{builderName}</Row>
              <Row label="Address">{address}</Row>
              <Row label="Job type">{job.job_type}</Row>
              <Row label="Contract type">{isBuilder ? (job.contract_type === 'open_book' ? 'Open book' : 'Fixed price') : null}</Row>
              <Row label="Projected dates">{[formatDate(job.projected_start), formatDate(job.projected_end)].filter(Boolean).join(' – ')}</Row>
              {priv?.contract_price != null && <Row label="Contract price">{formatCAD(Number(priv.contract_price))}</Row>}
            </dl>
          </Card>
          {ctx.workspace.mode === 'client' && <ClientMoney jobId={id} />}
          <Card>
            <CardHeader title="Notes" />
            <div className="space-y-3 p-4 text-[13px]">
              <div>
                <div className="mb-1 text-xs font-medium text-text-3">{isBuilder ? 'Notes for subs and vendors' : 'Job notes'}</div>
                <p className="whitespace-pre-wrap">{(job.job_sub_notes as { body: string } | null)?.body || <span className="text-text-3">No notes.</span>}</p>
              </div>
              {priv?.internal_notes && (
                <div>
                  <div className="mb-1 text-xs font-medium text-text-3">Internal notes</div>
                  <p className="whitespace-pre-wrap">{priv.internal_notes}</p>
                </div>
              )}
            </div>
          </Card>

          <CustomFields module="jobs" recordId={id} orgId={job.org_id} path={`/jobs/${id}`} canEdit={canEdit} audience={ctx.workspace.mode === 'builder' ? 'internal' : ctx.workspace.mode} />

          <CommentThread jobId={id} recordType="job" recordId={id} mode={ctx.workspace.mode} path={`/jobs/${id}`} canShareWithClient={subCanShare} />

          {isBuilder && (
            <Card>
              <CardHeader title="Subs and vendors on this job" description="Subs only see jobs they are added to." />
              <ul className="divide-y divide-border">
                {subs.map((s) => (
                  <li key={s.sub_org_id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{s.company_name}</div>
                      <div className="text-xs text-text-3">{[s.trade, ...s.flags].filter(Boolean).join(' · ')}</div>
                    </div>
                    {canEdit && (
                      <form action={removeJobSub.bind(null, id, s.sub_org_id)}>
                        <Button type="submit" size="icon" variant="ghost" aria-label={`Remove ${s.company_name}`}><X /></Button>
                      </form>
                    )}
                  </li>
                ))}
                {subs.length === 0 && <li className="px-4 py-3 text-[13px] text-text-3">No subs on this job yet.</li>}
              </ul>
              {canEdit && (
                linkable.length > 0 ? (
                  <form action={addJobSub.bind(null, id)} className="space-y-3 border-t border-border p-4">
                    <div className="flex gap-2">
                      <Select name="sub_org_id" aria-label="Sub or vendor" required className="flex-1">
                        {linkable.map((l) => <option key={l.sub_org_id} value={l.sub_org_id}>{l.company_name}{l.trade ? ` — ${l.trade}` : ''}</option>)}
                      </Select>
                      <Button type="submit" variant="primary"><UserPlus />Add to job</Button>
                    </div>
                    <fieldset className="grid gap-1 text-[13px] sm:grid-cols-2">
                      <legend className="mb-1 text-xs font-medium text-text-3">Extra permissions on this job</legend>
                      <label className="flex items-center gap-2"><input type="checkbox" name="can_view_owner_info" className="accent-brand" />View owner information</label>
                      <label className="flex items-center gap-2"><input type="checkbox" name="can_share_with_client" className="accent-brand" />Share comments and files with owner</label>
                      <label className="flex items-center gap-2"><input type="checkbox" name="can_assign_rfis_to_subs" className="accent-brand" />Assign RFIs to other subs</label>
                      <label className="flex items-center gap-2"><input type="checkbox" name="see_all_schedule_items" className="accent-brand" />See all schedule items</label>
                    </fieldset>
                  </form>
                ) : (
                  <p className="border-t border-border px-4 py-3 text-[13px] text-text-3">
                    All your subs are on this job. <Link className="text-brand underline" href="/settings/subs">Add a sub or vendor</Link>
                  </p>
                )
              )}
            </Card>
          )}

          {isBuilder && can(ctx, 'clients', 'view') && (
            <Card>
              <CardHeader title="Clients" description="Homeowners on this job. Invite them to follow progress in the client portal." />
              <ul className="divide-y divide-border">
                {clients.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-text-3">{[c.email, c.phone].filter(Boolean).join(' · ')}</div>
                    </div>
                    {c.user_id ? <Badge tone="success">Active</Badge> : c.invited_at ? <span className="flex items-center gap-2"><Badge tone="warning">Invited</Badge>{clientInvite.get(c.id) && <CopyButton value={`${site}/invite/${clientInvite.get(c.id)}`} label="Invite link" />}</span> : c.email && can(ctx, 'clients', 'add') ? (
                      <form action={inviteJobClient.bind(null, id, c.id)}><Button type="submit" size="sm">Invite</Button></form>
                    ) : <Badge>Not invited</Badge>}
                    {can(ctx, 'clients', 'delete') && (
                      <form action={removeJobClient.bind(null, id, c.id)}>
                        <Button type="submit" size="icon" variant="ghost" aria-label={`Remove ${c.name}`}><X /></Button>
                      </form>
                    )}
                  </li>
                ))}
                {clients.length === 0 && <li className="px-4 py-3 text-[13px] text-text-3">No clients on this job yet.</li>}
              </ul>
              {can(ctx, 'clients', 'add') && <AddClientForm action={addJobClient.bind(null, id)} />}
            </Card>
          )}

          {isBuilder && canEdit && (
            <Card>
              <CardHeader title="Client portal on this job" description="What this job's clients can see and do. Starts from your company defaults." />
              <ActionForm action={saveJobPortal.bind(null, id)} resetOnSuccess={false} className="space-y-4 p-4">
                <PortalSettingsFields s={portal} idPrefix="job-" />
                <Button type="submit">Save portal settings</Button>
              </ActionForm>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Additional information" />
            <dl className="divide-y divide-border">
              <Row label="Project managers">{managers.map((m) => m.name).join(', ')}</Row>
              <Row label="Permit">{job.permit_number}</Row>
              <Row label="Lot">{job.lot_info}</Row>
              <Row label="Square feet">{job.square_feet?.toLocaleString('en-CA')}</Row>
            </dl>
          </Card>
          {!isBuilder && managers.length > 0 && showPm && (
            <Card>
              <CardHeader title="Builder contact" />
              <ul className="divide-y divide-border">
                {managers.map((m) => (
                  <li key={m.email} className="px-4 py-2 text-[13px]">
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-text-3">{[m.email, m.phone].filter(Boolean).join(' · ')}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {isBuilder && (
            <Card>
              <CardHeader title="Team access" description="Who on your team can open this job." />
              <ul className="divide-y divide-border">
                {team.map((t) => (
                  <li key={t.user_id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{t.name}</div>
                      <div className="text-xs text-text-3">{t.role_name}</div>
                    </div>
                    {t.all_jobs ? <Badge tone="brand">All jobs</Badge> : canEdit ? (
                      <form action={setJobMember.bind(null, id, t.user_id, !t.on_job)}>
                        <Button type="submit" size="sm" variant={t.on_job ? 'secondary' : 'ghost'}>{t.on_job ? 'Has access' : 'Give access'}</Button>
                      </form>
                    ) : t.on_job ? <Badge tone="success">Has access</Badge> : null}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

async function portalSettings(jobId: string, orgId: string): Promise<Record<string, unknown>> {
  const supabase = await createClient()
  const [{ data: own }, { data: def }] = await Promise.all([
    supabase.from('job_client_permissions').select('settings').eq('job_id', jobId).maybeSingle(),
    supabase.from('client_permission_defaults').select('settings').eq('org_id', orgId).maybeSingle(),
  ])
  return { ...((def?.settings ?? {}) as Record<string, unknown>), ...((own?.settings ?? {}) as Record<string, unknown>) }
}
