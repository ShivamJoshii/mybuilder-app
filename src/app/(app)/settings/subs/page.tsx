import type { Metadata } from 'next'
import { HardHat, Plus } from 'lucide-react'
import Link from 'next/link'
import { requireBuilder, can, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { CERT_KINDS, COMPLIANCE_STATUS, REQUIRABLE } from '@/lib/compliance'
import { saveComplianceRules } from '../compliance-actions'
import { Field, Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionForm } from '@/components/kit/action-form'
import { CopyButton } from '@/components/kit/copy-button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { addSub, setSubStatus, updateSubLink } from '../actions'

export const metadata: Metadata = { title: 'Subs and vendors' }

export default async function SubsPage() {
  const ctx = await requireBuilder('subs_vendors')
  const supabase = await createClient()
  const [{ data: links }, { data: invites }, { data: jobSubs }] = await Promise.all([
    supabase.from('builder_sub_links').select('*').eq('builder_org_id', ctx.workspace.orgId).order('company_name'),
    can(ctx, 'subs_vendors', 'add')
      ? supabase.from('invites').select('id,email,token,sub_org_id').eq('org_id', ctx.workspace.orgId).eq('kind', 'sub').is('accepted_at', null)
      : Promise.resolve({ data: [] as { id: string; email: string; token: string; sub_org_id: string | null }[] }),
    supabase.from('job_subs').select('sub_org_id, jobs!inner(org_id)').eq('jobs.org_id', ctx.workspace.orgId),
  ])
  const [compliance, { data: org }] = await Promise.all([
    Promise.all((links ?? []).map((l) => supabase.rpc('sub_compliance', { p_builder: ctx.workspace.orgId, p_sub: l.sub_org_id }).then((r) => [l.sub_org_id, r.data?.[0]] as const))),
    supabase.from('organizations').select('compliance_required,compliance_blocks_payment').eq('id', ctx.workspace.orgId).single(),
  ])
  const comp = new Map(compliance)
  const inviteBySub = new Map((invites ?? []).map((i) => [i.sub_org_id, i]))
  const jobCount = new Map<string, number>()
  for (const j of jobSubs ?? []) jobCount.set(j.sub_org_id, (jobCount.get(j.sub_org_id) ?? 0) + 1)
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const canEdit = can(ctx, 'subs_vendors', 'edit')

  return (
    <>
      <PageHeader title="Subs and vendors" actions={can(ctx, 'subs_vendors', 'add') && (
        <Dialog>
          <DialogTrigger asChild><Button variant="primary"><Plus />Add sub or vendor</Button></DialogTrigger>
          <DialogContent title="Add a sub or vendor" description="If they already use MyBuilder with another builder, their existing account is linked.">
            <ActionForm action={addSub} className="grid gap-4 p-4 sm:grid-cols-2">
              <Field label="Company name" htmlFor="company_name" required className="sm:col-span-2"><Input id="company_name" name="company_name" required /></Field>
              <Field label="Email" htmlFor="sub_email" required className="sm:col-span-2"><Input id="sub_email" name="email" type="email" required /></Field>
              <Field label="Trade" htmlFor="trade" hint="e.g. Electrical, Framing"><Input id="trade" name="trade" /></Field>
              <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" type="tel" /></Field>
              <Field label="Contact first name" htmlFor="first"><Input id="first" name="first" /></Field>
              <Field label="Contact last name" htmlFor="last"><Input id="last" name="last" /></Field>
              <div className="sm:col-span-2"><Button type="submit" variant="primary">Add</Button></div>
            </ActionForm>
          </DialogContent>
        </Dialog>
      )} />
      <div className="space-y-5 p-5">
        <Card>
          {(links ?? []).length === 0 ? (
            <EmptyState icon={HardHat} title="Add your trades and suppliers" body="Subs you add can be put on jobs, get bid requests and POs, and see only the jobs they work on." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-surface-2 text-left text-xs font-semibold text-text-2">
                  <tr><th className="px-3 py-2">Company</th><th className="px-3 py-2">Trade</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Jobs</th><th className="px-3 py-2">Portal</th><th className="px-3 py-2">Compliance</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody>
                  {(links ?? []).map((l) => {
                    const inv = inviteBySub.get(l.sub_org_id)
                    return (
                      <tr key={l.id} className="border-t border-border">
                        <td className="px-3 py-2 font-medium"><Link href={`/settings/subs/${l.id}`} className="text-brand hover:underline">{l.company_name}</Link></td>
                        <td className="px-3 py-2">{l.trade}</td>
                        <td className="px-3 py-2">
                          <div>{[l.primary_contact_first, l.primary_contact_last].filter(Boolean).join(' ')}</div>
                          <div className="text-xs text-text-3">{[l.primary_email, l.business_phone].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td className="px-3 py-2">{jobCount.get(l.sub_org_id) ?? 0}</td>
                        <td className="px-3 py-2">{inv ? <span className="flex items-center gap-2"><Badge tone="warning">Invited</Badge><CopyButton value={`${site}/invite/${inv.token}`} label="Invite link" /></span> : <Badge tone="success">Joined</Badge>}</td>
                        <td className="px-3 py-2">{(() => { const c = comp.get(l.sub_org_id); const st = COMPLIANCE_STATUS[c?.status ?? 'ok']
                          return <span title={c?.detail || undefined}><Badge tone={st.tone}>{st.label}</Badge></span> })()}</td>
                        <td className="px-3 py-2">{l.status === 'pending'
                          ? <span title="This company already uses MyBuilder. Their admin must accept your invite before they can see your jobs."><Badge tone="warning">Awaiting their OK</Badge></span>
                          : <Badge tone={l.status === 'active' ? 'success' : 'neutral'}>{l.status}</Badge>}</td>
                        <td className="px-3 py-2 text-right">
                          {canEdit && (
                            <span className="flex justify-end gap-1">
                              <Dialog>
                                <DialogTrigger asChild><Button size="sm">Edit</Button></DialogTrigger>
                                <DialogContent title={`Edit ${l.company_name}`}>
                                  <ActionForm action={updateSubLink.bind(null, l.id)} resetOnSuccess={false} className="space-y-4 p-4">
                                    <Field label="Company name" htmlFor={`cn-${l.id}`}><Input id={`cn-${l.id}`} name="company_name" defaultValue={l.company_name} /></Field>
                                    <Field label="Trade" htmlFor={`tr-${l.id}`}><Input id={`tr-${l.id}`} name="trade" defaultValue={l.trade ?? ''} /></Field>
                                    <Field label="Email" htmlFor={`em-${l.id}`}><Input id={`em-${l.id}`} name="primary_email" type="email" defaultValue={l.primary_email ?? ''} /></Field>
                                    <Field label="Phone" htmlFor={`ph-${l.id}`}><Input id={`ph-${l.id}`} name="business_phone" defaultValue={l.business_phone ?? ''} /></Field>
                                    <Button type="submit" variant="primary">Save</Button>
                                  </ActionForm>
                                </DialogContent>
                              </Dialog>
                              {l.status !== 'pending' && (
                                <form action={setSubStatus.bind(null, l.id, l.status === 'active' ? 'inactive' : 'active')}>
                                  <Button type="submit" size="sm" variant="ghost">{l.status === 'active' ? 'Deactivate' : 'Activate'}</Button>
                                </form>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {hasAction(ctx, 'settings.manage') && (
          <Card>
            <CardHeader title="Compliance rules" description="What every sub must keep on file with you. Subs add certificates from their portal; you can add them too." />
            <ActionForm action={saveComplianceRules} resetOnSuccess={false} className="space-y-3 p-4 text-[13px]">
              <div className="grid gap-2 sm:grid-cols-3">
                {REQUIRABLE.map((k) => (
                  <label key={k} className="flex items-center gap-2"><Checkbox name="required" value={k} defaultChecked={org?.compliance_required.includes(k)} />{CERT_KINDS[k]}</label>
                ))}
              </div>
              <label className="flex items-center gap-2"><Checkbox name="block" defaultChecked={org?.compliance_blocks_payment} />Block payments to subs with missing or expired documents</label>
              <Button type="submit">Save rules</Button>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  )
}
