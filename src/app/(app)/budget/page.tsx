import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PrintButton } from '@/components/kit/print-button'
import { cn, formatCAD } from '@/lib/utils'
import { COST_TYPES } from '@/lib/estimate'

export const metadata: Metadata = { title: 'Budget' }

type B = { cost_code_id: string | null; cost_type: string; original_cost: number; original_price: number; co_cost: number; co_price: number; committed: number; actual: number; paid: number }
const n = (x: unknown) => Number(x ?? 0)
const sum = (rows: B[], k: keyof B) => rows.reduce((s, r) => s + n(r[k]), 0)
const typeLabel = new Map(COST_TYPES.map((c) => [c.value as string, c.label]))

export default async function BudgetPage({ searchParams }: PageProps<'/budget'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  if (ctx.workspace.mode !== 'builder') redirect('/summary')
  if (!(can(ctx, 'budget') && can(ctx, 'budget', 'cost'))) redirect('/summary?denied=budget')
  const picked = selectedJobs(ctx)
  const supabase = await createClient()
  const focus = typeof sp.job === 'string' ? ctx.jobs.find((j) => j.id === sp.job) : picked.length === 1 ? picked[0] : undefined

  if (!focus) {
    const all = await Promise.all(picked.map(async (j) => ({ j, rows: ((await supabase.rpc('job_budget', { p_job: j.id })).data ?? []) as B[] })))
    return (
      <>
        <PageHeader title="Budget" jobName={selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length)} />
        {picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
        <div className="p-5">
          {picked.length === 0 ? <EmptyState icon={Wallet} title="Know where every dollar is" body="Pick a job to see its original and revised budget against committed and actual costs." /> : (
            <Card className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="px-4 py-2">Job</th><th className="px-4 py-2 text-right">Revised budget</th><th className="px-4 py-2 text-right">Committed</th><th className="px-4 py-2 text-right">Actual</th><th className="px-4 py-2 text-right">Contract price</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {all.map(({ j, rows }) => (
                    <tr key={j.id}>
                      <td className="px-4 py-2"><Link href={`/budget?job=${j.id}`} className="font-medium text-brand hover:underline">{j.title}</Link></td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCAD(sum(rows, 'original_cost') + sum(rows, 'co_cost'))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCAD(sum(rows, 'committed'))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCAD(sum(rows, 'actual'))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCAD(sum(rows, 'original_price') + sum(rows, 'co_price'))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </>
    )
  }

  const [{ data }, { data: codes }] = await Promise.all([
    supabase.rpc('job_budget', { p_job: focus.id }),
    supabase.from('cost_codes').select('id,code,title').eq('org_id', focus.org_id),
  ])
  const rows = ((data ?? []) as B[]).map((r) => ({ ...r, code: codes?.find((c) => c.id === r.cost_code_id) }))
    .sort((a, b) => (a.code?.code ?? 'zzz').localeCompare(b.code?.code ?? 'zzz', 'en', { numeric: true }))
  const revised = (r: B) => n(r.original_cost) + n(r.co_cost)
  const exposure = (r: B) => Math.max(n(r.committed), n(r.actual))
  const T = { oc: sum(rows, 'original_cost'), cc: sum(rows, 'co_cost'), cm: sum(rows, 'committed'), ac: sum(rows, 'actual'), pd: sum(rows, 'paid'), op: sum(rows, 'original_price'), cp: sum(rows, 'co_price') }
  const revisedTotal = T.oc + T.cc
  const contract = T.op + T.cp
  const projectedCost = rows.reduce((s, r) => s + Math.max(revised(r), exposure(r)), 0)
  const cards: [string, string, number][] = [
    ['contract', 'Contract price', contract], ['revised', 'Revised budget', revisedTotal], ['committed', 'Committed (POs)', T.cm],
    ['actual', 'Actual (bills)', T.ac], ['profit', 'Projected profit', contract - projectedCost],
  ]

  return (
    <>
      <PageHeader title="Budget" jobName={focus.title} jobHref={`/jobs/${focus.id}`} actions={<PrintButton />} />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {cards.map(([k, l, v]) => (
            <Card key={k} className="p-3"><div className="text-xs text-text-3">{l}</div><div className={cn('text-lg font-semibold tabular-nums', v < 0 && 'text-danger')} data-testid={`budget-${k}`}>{formatCAD(v)}</div></Card>
          ))}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No budget yet" body="Send an approved estimate to the budget, or issue purchase orders and bills, and they show up here by cost code." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3">
                <tr><th className="px-3 py-2">Cost code</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Original</th><th className="px-3 py-2 text-right">Change orders</th><th className="px-3 py-2 text-right">Revised</th>
                  <th className="px-3 py-2 text-right">Committed</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Remaining</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => {
                  const rem = revised(r) - exposure(r)
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2">{r.code ? <><span className="text-text-3">{r.code.code}</span> {r.code.title}</> : <span className="text-text-3">No cost code</span>}</td>
                      <td className="px-3 py-2 text-text-3">{typeLabel.get(r.cost_type)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCAD(n(r.original_cost))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{n(r.co_cost) ? formatCAD(n(r.co_cost)) : ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCAD(revised(r))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCAD(n(r.committed))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCAD(n(r.actual))}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-text-3">{formatCAD(n(r.paid))}</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', rem < 0 && 'font-medium text-danger')}>{formatCAD(rem)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCAD(T.oc)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCAD(T.cc)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCAD(revisedTotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCAD(T.cm)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCAD(T.ac)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCAD(T.pd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCAD(rows.reduce((s, r) => s + revised(r) - exposure(r), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        )}
        <p className="text-xs text-text-3">Remaining = revised budget − the larger of committed and actual cost. Amounts exclude GST.</p>
      </div>
    </>
  )
}
