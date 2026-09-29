import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Calculator, FileSignature, Lock, Unlock, Wallet } from 'lucide-react'
import { requireBuilder, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { formatCAD, formatDate } from '@/lib/utils'
import { PROPOSAL_STATUS, type EstGroup, type EstItem } from '@/lib/estimate'
import { Worksheet, type CatalogItem } from '@/components/kit/cost-worksheet'
import { createProposal, saveEstimate, sendToBudget, startEstimate, unlockEstimate } from '../actions'

export const metadata: Metadata = { title: 'Estimate' }

export default async function EstimatePage({ params }: PageProps<'/estimates/[jobId]'>) {
  const { jobId } = await params
  const ctx = await requireBuilder('estimates')
  const job = ctx.jobs.find((j) => j.id === jobId)
  if (!job) notFound()
  const supabase = await createClient()
  const { data: est } = await supabase.from('estimates').select('*').eq('job_id', jobId).maybeSingle()
  const canAdd = can(ctx, 'estimates', 'add')
  const canEdit = can(ctx, 'estimates', 'edit')
  const seeCost = can(ctx, 'estimates', 'cost')
  const canPropose = can(ctx, 'proposals', 'add') || canAdd

  if (!est) {
    return (
      <>
        <PageHeader title="Estimate" jobName={job.title} jobHref={`/jobs/${job.id}`} />
        <div className="p-5">
          <EmptyState icon={Calculator} title="Estimate the job"
            body="Build line items by cost code with markup and tax, then send a proposal your client can sign. Approved scope becomes the job budget."
            action={canAdd ? <form action={startEstimate.bind(null, job.id)}><Button type="submit" variant="primary">Start estimate</Button></form> : undefined} />
        </div>
      </>
    )
  }

  const [{ data: groups }, { data: items }, { data: codes }, { data: catalog }, { data: proposals }] = await Promise.all([
    supabase.from('estimate_groups').select('id,name,sort,is_optional,option_status').eq('estimate_id', est.id).order('sort'),
    seeCost ? supabase.from('estimate_items').select('*').eq('estimate_id', est.id).order('sort') : Promise.resolve({ data: [] }),
    supabase.from('cost_codes').select('id,code,title').eq('org_id', job.org_id).eq('is_active', true).order('code'),
    seeCost ? supabase.from('cost_items').select('id,title,description,unit,unit_cost,cost_type,markup_type,markup_value,taxable,cost_code_id').eq('org_id', job.org_id).eq('is_active', true).order('title') : Promise.resolve({ data: [] }),
    supabase.from('proposals').select('id,title,status,total,released_at,decided_at').eq('estimate_id', est.id).order('created_at', { ascending: false }),
  ])
  const approved = (proposals ?? []).some((p) => p.status === 'approved')
  const locked = Boolean(est.locked_at)

  return (
    <>
      <PageHeader title="Estimate" jobName={job.title} jobHref={`/jobs/${job.id}`} actions={<>
        {locked && <Badge tone="success"><Lock className="mr-1 size-3" />Sent to budget {formatDate(est.sent_to_budget_at)}</Badge>}
        {canPropose && <form action={createProposal.bind(null, est.id, job.id)}><Button type="submit"><FileSignature />Create proposal</Button></form>}
        {canEdit && !locked && approved && (
          <form action={sendToBudget.bind(null, est.id, job.id)}>
            <ConfirmSubmit variant="primary" title="Send to budget?" confirmLabel="Send to budget"
              body="This locks the estimate and writes the approved scope into the job budget. It also sets the contract price."><Wallet />Send to budget</ConfirmSubmit>
          </form>
        )}
        {canEdit && locked && (
          <form action={unlockEstimate.bind(null, est.id, job.id)}>
            <ConfirmSubmit title="Unlock the estimate?" confirmLabel="Unlock"
              body="Unlocking removes the original budget lines that came from this estimate. Send it to budget again when you're done."><Unlock />Unlock</ConfirmSubmit>
          </form>
        )}
      </>} />
      <div className="space-y-4 p-5">
        {!approved && !locked && canEdit && <Alert tone="info">When your client approves a proposal, send the estimate to the budget to lock it and set the contract price.</Alert>}
        {seeCost ? (
          <Worksheet key={`${est.id}-${locked}`} save={saveEstimate.bind(null, est.id, job.id)} editable={canEdit && !locked}
            initial={{ settings: { default_markup_pct: Number(est.default_markup_pct), tax_rate: Number(est.tax_rate), tax_label: est.tax_label },
              groups: (groups ?? []) as EstGroup[], items: (items ?? []).map((i) => ({ ...i, quantity: Number(i.quantity), unit_cost: Number(i.unit_cost), markup_value: Number(i.markup_value) })) as EstItem[] }}
            codes={codes ?? []} catalog={(catalog ?? []).map((c) => ({ ...c, unit_cost: Number(c.unit_cost), markup_value: Number(c.markup_value) })) as CatalogItem[]} />
        ) : (
          <PriceOnly estimateId={est.id} groups={(groups ?? []) as EstGroup[]} />
        )}
        <Card>
          <CardHeader title="Proposals" description="Released proposals freeze the estimate's prices at that moment." />
          <ul className="divide-y divide-border text-[13px]">
            {(proposals ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                <Link href={`/proposals/${p.id}`} className="font-medium text-brand hover:underline">{p.title}</Link>
                <Badge tone={PROPOSAL_STATUS[p.status].tone}>{PROPOSAL_STATUS[p.status].label}</Badge>
                <span className="ml-auto tabular-nums">{p.total != null ? formatCAD(Number(p.total)) : ''}</span>
              </li>
            ))}
            {(proposals ?? []).length === 0 && <li className="px-4 py-3 text-text-3">No proposals yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  )
}

async function PriceOnly({ estimateId, groups }: { estimateId: string; groups: EstGroup[] }) {
  const supabase = await createClient()
  const { data: lines } = await supabase.rpc('estimate_price_lines', { p_estimate: estimateId })
  const name = new Map(groups.map((g) => [g.id, g.name]))
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Client pricing" description="Your role sees client prices only." />
      <table className="w-full text-[13px]">
        <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="px-4 py-2">Group</th><th className="px-4 py-2">Item</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Price</th></tr></thead>
        <tbody className="divide-y divide-border">
          {(lines ?? []).map((l) => (
            <tr key={l.id}><td className="px-4 py-2 text-text-3">{l.group_id ? name.get(l.group_id) : ''}</td><td className="px-4 py-2">{l.title}</td>
              <td className="px-4 py-2 text-right">{Number(l.quantity)} {l.unit}</td><td className="px-4 py-2 text-right tabular-nums">{formatCAD(Number(l.price))}</td></tr>
          ))}
          {(lines ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-3 text-text-3">No line items yet.</td></tr>}
        </tbody>
      </table>
    </Card>
  )
}
