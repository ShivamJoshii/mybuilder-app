import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Calculator } from 'lucide-react'
import { requireBuilder, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCAD } from '@/lib/utils'
import { itemCost, itemPrice, type EstItem } from '@/lib/estimate'

export const metadata: Metadata = { title: 'Estimates' }

export default async function EstimatesPage() {
  const ctx = await requireBuilder('estimates')
  const picked = selectedJobs(ctx)
  if (picked.length === 1) redirect(`/estimates/${picked[0].id}`)
  const supabase = await createClient()
  const seeCost = can(ctx, 'estimates', 'cost')
  const ids = picked.map((j) => j.id)
  const { data: ests } = ids.length ? await supabase.from('estimates').select('id,job_id,locked_at,sent_to_budget_at').in('job_id', ids) : { data: [] }
  const { data: items } = seeCost && ests?.length
    ? await supabase.from('estimate_items').select('estimate_id,quantity,unit_cost,markup_type,markup_value').in('estimate_id', ests.map((e) => e.id))
    : { data: [] }
  const byJob = new Map((ests ?? []).map((e) => [e.job_id, e]))
  type Money = Pick<EstItem, 'quantity' | 'unit_cost' | 'markup_type' | 'markup_value'>
  const sum = (estId: string, f: (i: Money) => number) => (items ?? []).filter((i) => i.estimate_id === estId).reduce((s, i) => s + f(i), 0)

  return (
    <>
      <PageHeader title="Estimates" jobName={selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length)} />
      {picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="p-5">
        {picked.length === 0 ? (
          <EmptyState icon={Calculator} title="Estimate the job" body="Pick a job on the left to build its estimate: line items by cost code, markup and tax, then a proposal your client can sign." />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3">
                <tr><th className="px-4 py-2">Job</th><th className="px-4 py-2">Status</th>{seeCost && <th className="px-4 py-2 text-right">Builder cost</th>}{seeCost && <th className="px-4 py-2 text-right">Client price</th>}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {picked.map((j) => {
                  const e = byJob.get(j.id)
                  return (
                    <tr key={j.id}>
                      <td className="px-4 py-2"><Link href={`/estimates/${j.id}`} className="font-medium text-brand hover:underline">{j.title}</Link></td>
                      <td className="px-4 py-2">{!e ? <span className="text-text-3">Not started</span> : e.sent_to_budget_at ? <Badge tone="success">Sent to budget</Badge> : <Badge>In progress</Badge>}</td>
                      {seeCost && <td className="px-4 py-2 text-right tabular-nums">{e ? formatCAD(sum(e.id, itemCost)) : ''}</td>}
                      {seeCost && <td className="px-4 py-2 text-right tabular-nums">{e ? formatCAD(sum(e.id, itemPrice)) : ''}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  )
}
