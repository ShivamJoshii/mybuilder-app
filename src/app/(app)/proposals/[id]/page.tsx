import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Send, Trash2 } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ActionForm } from '@/components/kit/action-form'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { PrintButton } from '@/components/kit/print-button'
import { formatCAD, formatDate, fullName } from '@/lib/utils'
import { PROPOSAL_STATUS, totals, type EstGroup, type SnapshotGroup } from '@/lib/estimate'
import { DecisionForm } from '@/components/kit/decision-form'
import { Signatures } from '@/components/kit/signatures'
import { decideProposal, deleteProposal, releaseProposal, updateProposal } from '../actions'

export const metadata: Metadata = { title: 'Proposal' }

export default async function ProposalPage({ params }: PageProps<'/proposals/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  if (ctx.workspace.mode === 'sub') redirect('/summary')
  const supabase = await createClient()
  const { data: p } = await supabase.from('proposals').select('*').eq('id', id).maybeSingle()
  if (!p) notFound()
  const builder = ctx.workspace.mode === 'builder'
  const canEdit = builder && (can(ctx, 'proposals', 'edit') || can(ctx, 'estimates', 'edit'))
  const canDelete = builder && (can(ctx, 'proposals', 'delete') || can(ctx, 'estimates', 'delete'))
  const [{ data: org }, { data: job }, { data: sigs }] = await Promise.all([
    supabase.from('organizations').select('name,phone,email,street,city,province,postal_code').eq('id', p.org_id).single(),
    supabase.from('jobs').select('title,street,city,province,postal_code').eq('id', p.job_id).single(),
    supabase.from('proposal_signatures').select('*').eq('proposal_id', id).order('signed_at'),
  ])

  // Draft: live prices from the estimate. Released: the frozen snapshot.
  let doc: SnapshotGroup[] = (p.snapshot as SnapshotGroup[] | null) ?? []
  let sums = { subtotal: Number(p.subtotal ?? 0), tax: Number(p.tax ?? 0), total: Number(p.total ?? 0) }
  let taxLabel = p.tax_label ?? 'Tax'
  const { data: est } = builder ? await supabase.from('estimates').select('tax_rate,tax_label').eq('id', p.estimate_id).maybeSingle() : { data: null }
  if (est && p.status === 'draft') taxLabel = `${est.tax_label} (${Number(est.tax_rate)}%)`
  if (p.status === 'draft' && builder) {
    const [{ data: lines }, { data: groups }] = await Promise.all([
      supabase.rpc('estimate_price_lines', { p_estimate: p.estimate_id }),
      supabase.from('estimate_groups').select('id,name,sort,is_optional,option_status').eq('estimate_id', p.estimate_id).order('sort'),
    ])
    const gs = (groups ?? []) as EstGroup[]
    const ls = lines ?? []
    const byGroup = (gid: string | null) => ls.filter((l) => l.group_id === gid)
    doc = [
      ...gs.filter((g) => !(g.is_optional && g.option_status === 'declined')).map((g) => ({ id: g.id, name: g.name, sort: g.sort, optional: g.is_optional,
        lines: byGroup(g.id).map((l) => ({ title: l.title, description: l.description, quantity: Number(l.quantity), unit: l.unit, price: Number(l.price), taxable: l.taxable })),
        total: byGroup(g.id).reduce((s, l) => s + Number(l.price), 0) })),
      ...(byGroup(null).length ? [{ id: 'ungrouped', name: 'Items', sort: 99999, optional: false,
        lines: byGroup(null).map((l) => ({ title: l.title, description: l.description, quantity: Number(l.quantity), unit: l.unit, price: Number(l.price), taxable: l.taxable })),
        total: byGroup(null).reduce((s, l) => s + Number(l.price), 0) }] : []),
    ].filter((g) => g.lines.length)
    const base = doc.filter((g) => !g.optional).flatMap((g) => g.lines)
    const t = totals(base.map((l, i) => ({ id: String(i), group_id: null, cost_code_id: null, cost_type: 'none', title: l.title, description: null, internal_notes: null,
      quantity: 1, unit: 'ea', unit_cost: l.price, markup_type: 'amount', markup_value: 0, taxable: l.taxable, marked_as: 'none', sort: i })), [], Number(est?.tax_rate ?? 0))
    sums = { subtotal: t.price, tax: t.tax, total: t.total }
  }
  const st = PROPOSAL_STATUS[p.status]
  const isClient = ctx.workspace.mode === 'client'

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost"><Link href={builder ? `/estimates/${p.job_id}` : '/proposals'}><ArrowLeft />{builder ? 'Estimate' : 'Proposals'}</Link></Button>
        <div className="flex gap-2">
          <PrintButton />
          {p.status === 'draft' && canDelete && (
            <form action={deleteProposal.bind(null, id)}><ConfirmSubmit variant="ghost" title="Delete this draft?" body="The draft proposal will be removed. Your estimate is not affected."><Trash2 />Delete</ConfirmSubmit></form>
          )}
          {p.status === 'draft' && canEdit && (
            <form action={releaseProposal.bind(null, id)}>
              <ConfirmSubmit variant="primary" title="Release to the client?" confirmLabel="Release"
                body="The prices are frozen and the client is notified to review and sign. You can't edit a released proposal."><Send />Release to client</ConfirmSubmit>
            </form>
          )}
        </div>
      </div>

      {p.status === 'draft' && canEdit && (
        <Card className="print:hidden">
          <CardHeader title="Proposal settings" description="Prices below update from the estimate until you release." />
          <ActionForm action={updateProposal.bind(null, id)} resetOnSuccess={false} className="grid gap-3 p-4 md:grid-cols-2">
            <label className="text-[13px] font-medium text-text-2 md:col-span-2">Title<Input name="title" className="mt-1" defaultValue={p.title} required maxLength={200} /></label>
            <label className="text-[13px] font-medium text-text-2 md:col-span-2">Introduction<Textarea name="intro" className="mt-1" defaultValue={p.intro ?? ''} rows={3} maxLength={8000} /></label>
            <label className="text-[13px] font-medium text-text-2 md:col-span-2">Closing text<Textarea name="closing" className="mt-1" defaultValue={p.closing ?? ''} rows={3} maxLength={8000} /></label>
            <label className="text-[13px] font-medium text-text-2">Approval deadline<Input type="date" name="approval_deadline" className="mt-1" defaultValue={p.approval_deadline ?? ''} /></label>
            <div className="space-y-1.5 text-[13px] text-text-2">
              <label className="flex items-center gap-2"><Checkbox name="collect_signature" defaultChecked={p.collect_signature} /> Require a signature to approve</label>
              <label className="flex items-center gap-2"><Checkbox name="show_line_items" defaultChecked={p.show_line_items} /> Show line items</label>
              <label className="flex items-center gap-2"><Checkbox name="show_quantities" defaultChecked={p.show_quantities} /> Show quantities</label>
            </div>
            <div className="md:col-span-2"><Button type="submit" variant="primary">Save settings</Button></div>
          </ActionForm>
        </Card>
      )}

      <Card className="p-6 print:border-0 print:shadow-none">
        <div className="flex flex-wrap justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="text-lg font-semibold">{org?.name}</div>
            <div className="text-[13px] text-text-3">{[org?.street, org?.city, org?.province, org?.postal_code].filter(Boolean).join(', ')}</div>
            <div className="text-[13px] text-text-3">{[org?.phone, org?.email].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="text-right text-[13px]">
            <Badge tone={st.tone}>{st.label}</Badge>
            <div className="mt-1 text-text-3">{p.released_at ? `Issued ${formatDate(p.released_at)}` : 'Not yet released'}</div>
            {p.approval_deadline && <div className="text-text-3">Respond by {formatDate(p.approval_deadline)}</div>}
          </div>
        </div>
        <h1 className="mt-4 text-xl font-semibold">{p.title}</h1>
        <div className="text-[13px] text-text-3">{job?.title}{job?.street ? ` · ${[job.street, job.city, job.province].filter(Boolean).join(', ')}` : ''}</div>
        {p.intro && <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed">{p.intro}</p>}

        <div className="mt-5 space-y-4">
          {doc.map((g) => (
            <div key={g.id}>
              <div className="flex items-baseline justify-between border-b border-border pb-1">
                <h2 className="font-medium">{g.name}{g.optional && <Badge tone="warning" className="ml-2">Optional</Badge>}</h2>
                <span className="tabular-nums">{formatCAD(g.total)}</span>
              </div>
              {p.show_line_items && (
                <table className="mt-1 w-full text-[13px]">
                  <tbody>
                    {g.lines.map((l, i) => (
                      <tr key={i} className="align-top">
                        <td className="py-1 pr-2">{l.title}{l.description && <div className="whitespace-pre-wrap text-xs text-text-3">{l.description}</div>}</td>
                        {p.show_quantities && <td className="w-28 py-1 text-right text-text-3">{Number(l.quantity)} {l.unit}</td>}
                        <td className="w-32 py-1 text-right tabular-nums">{formatCAD(Number(l.price))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
          {doc.length === 0 && <p className="text-[13px] text-text-3">Add line items to the estimate to build this proposal.</p>}
        </div>

        <div className="ml-auto mt-6 w-full max-w-xs space-y-1 text-[14px]">
          <div className="flex justify-between"><span className="text-text-3">Subtotal</span><span className="tabular-nums">{formatCAD(sums.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-text-3">{taxLabel}</span><span className="tabular-nums">{formatCAD(sums.tax)}</span></div>
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold"><span>Total</span><span className="tabular-nums" data-testid="proposal-total">{formatCAD(sums.total)}</span></div>
          {doc.some((g) => g.optional) && <p className="text-xs text-text-3">Optional items are not included in the total.</p>}
        </div>
        {p.closing && <p className="mt-6 whitespace-pre-wrap text-[14px] leading-relaxed">{p.closing}</p>}

        <Signatures sigs={sigs ?? []} />
      </Card>

      {p.status === 'released' && (isClient || canEdit) && (
        <Card className="print:hidden">
          <CardHeader title={isClient ? 'Your decision' : 'Record the client’s decision'} />
          <div className="p-4">
            <DecisionForm action={decideProposal.bind(null, id)} needSignature={p.collect_signature} onBehalf={!isClient}
              defaultName={isClient ? fullName(ctx.profile) : ''} />
          </div>
        </Card>
      )}
    </div>
  )
}
