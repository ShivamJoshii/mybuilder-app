import type { Metadata } from 'next'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { requireBuilder, can } from '@/lib/context'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PrintButton } from '@/components/kit/print-button'
import { cn, formatCAD, formatDate, todayIn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Reports' }

const TABS = [['wip', 'Work in progress'], ['ar', 'Receivables'], ['ap', 'Payables']] as const
const n = (x: unknown) => Number(x ?? 0)
const daysPast = (due: string | null, today: string) => (due ? Math.floor((Date.parse(today) - Date.parse(due)) / 86_400_000) : 0)
const BUCKETS: [string, (d: number) => boolean][] = [['Current', (d) => d <= 0], ['1–30', (d) => d > 0 && d <= 30], ['31–60', (d) => d > 30 && d <= 60], ['61–90', (d) => d > 60 && d <= 90], ['90+', (d) => d > 90]]

export default async function ReportsPage({ searchParams }: PageProps<'/reports'>) {
  const sp = await searchParams
  const ctx = await requireBuilder('reports')
  if (!can(ctx, 'reports', 'cost')) redirect('/summary?denied=reports')
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : 'wip'
  const supabase = await createClient()
  const org = ctx.workspace.orgId
  const today = todayIn(ctx.tz)

  const nav = (
    <nav className="mt-3 flex gap-4 text-[13px] print:hidden">
      {TABS.map(([k, l]) => <Link key={k} href={`/reports?tab=${k}`} className={cn('-mb-3 border-b-2 pb-2', tab === k ? 'border-brand font-medium text-brand' : 'border-transparent text-text-2')}>{l}</Link>)}
    </nav>
  )

  let body: React.ReactNode = null
  if (tab === 'wip') {
    const { data } = await supabase.rpc('report_wip', { p_org: org })
    const templateIds = new Set(ctx.jobs.filter((j) => j.is_template).map((j) => j.id))
    const rows = (data ?? []).filter((r) => !templateIds.has(r.job_id)).map((r) => {
      const pct = n(r.revised_cost) > 0 ? Math.min(1, n(r.cost_to_date) / n(r.revised_cost)) : 0
      const earned = n(r.contract) * pct
      return { ...r, pct, earned, over: n(r.billed) - earned, margin: n(r.contract) - n(r.revised_cost) }
    })
    const sum = (k: 'contract' | 'revised_cost' | 'committed' | 'cost_to_date' | 'billed' | 'received' | 'earned' | 'over') => rows.reduce((s, r) => s + n(r[k]), 0)
    body = rows.length === 0 ? <EmptyState icon={BarChart3} title="No active jobs to report on" body="Jobs appear here once they have a budget, purchase orders, bills or invoices." /> : (
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-[13px]">
          <thead className="bg-surface-2 text-left text-xs text-text-3">
            <tr><th className="px-3 py-2">Job</th><th className="px-3 py-2 text-right">Contract</th><th className="px-3 py-2 text-right">Est. cost</th><th className="px-3 py-2 text-right">Est. margin</th><th className="px-3 py-2 text-right">Committed</th>
              <th className="px-3 py-2 text-right">Cost to date</th><th className="px-3 py-2 text-right">% complete</th><th className="px-3 py-2 text-right">Earned</th><th className="px-3 py-2 text-right">Billed</th><th className="px-3 py-2 text-right">Over / (under) billed</th><th className="px-3 py-2 text-right">Received</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.job_id}>
                <td className="px-3 py-2"><Link href={`/budget?job=${r.job_id}`} className="font-medium text-brand hover:underline">{r.job_title}</Link>{r.status !== 'open' && <Badge className="ml-1">{r.status}</Badge>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCAD(n(r.contract))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCAD(n(r.revised_cost))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(r.contract) ? `${Math.round((r.margin / n(r.contract)) * 1000) / 10}%` : ''}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCAD(n(r.committed))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCAD(n(r.cost_to_date))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Math.round(r.pct * 100)}%</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCAD(r.earned)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCAD(n(r.billed))}</td>
                <td className={cn('px-3 py-2 text-right tabular-nums', r.over < 0 && 'text-danger')}>{formatCAD(r.over)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCAD(n(r.received))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCAD(sum('contract'))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCAD(sum('revised_cost'))}</td>
              <td />
              <td className="px-3 py-2 text-right tabular-nums">{formatCAD(sum('committed'))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCAD(sum('cost_to_date'))}</td>
              <td />
              <td className="px-3 py-2 text-right tabular-nums">{formatCAD(sum('earned'))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCAD(sum('billed'))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCAD(sum('over'))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCAD(sum('received'))}</td>
            </tr>
          </tfoot>
        </table>
        <p className="border-t border-border px-3 py-2 text-xs text-text-3">% complete uses cost to date ÷ estimated cost. Earned = contract × % complete. Amounts exclude GST/HST.</p>
      </Card>
    )
  } else {
    const rows = tab === 'ar'
      ? ((await supabase.rpc('report_receivables', { p_org: org })).data ?? []).map((r) => ({ id: r.invoice_id, href: `/invoices/${r.invoice_id}`, job: r.job_title, who: `#${r.number} ${r.title}`, date: r.invoice_date, due: r.due_date, amount: n(r.balance), flag: false }))
      : ((await supabase.rpc('report_payables', { p_org: org })).data ?? []).map((r) => ({ id: r.bill_id, href: `/bills/${r.bill_id}`, job: r.job_title, who: `${r.payee} · ${r.invoice_ref}`, date: r.invoice_date, due: r.due_date, amount: n(r.payable), flag: r.waiver_missing }))
    const bucketTotals = BUCKETS.map(([l, f]) => [l, rows.filter((r) => f(daysPast(r.due, today))).reduce((s, r) => s + r.amount, 0)] as const)
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {bucketTotals.map(([l, v]) => <Card key={l} className="p-3"><div className="text-xs text-text-3">{l === 'Current' ? 'Current' : `${l} days past due`}</div><div className={cn('text-lg font-semibold tabular-nums', l !== 'Current' && v > 0 && 'text-danger')}>{formatCAD(v)}</div></Card>)}
        </div>
        {rows.length === 0 ? <EmptyState icon={BarChart3} title={tab === 'ar' ? 'Nothing owing to you' : 'Nothing to pay'} body={tab === 'ar' ? 'Unpaid client invoices show here by age.' : 'Approved, unpaid bills show here by due date.'} /> : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="px-3 py-2">{tab === 'ar' ? 'Invoice' : 'Bill'}</th><th className="px-3 py-2">Job</th><th className="px-3 py-2">Dated</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Days past due</th><th className="px-3 py-2 text-right">{tab === 'ar' ? 'Balance' : 'Payable'}</th></tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const d = daysPast(r.due, today)
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2"><Link href={r.href} className="font-medium text-brand hover:underline">{r.who}</Link>{r.flag && <Badge tone="warning" className="ml-1">Lien waiver needed</Badge>}</td>
                      <td className="px-3 py-2">{r.job}</td>
                      <td className="px-3 py-2">{formatDate(r.date)}</td>
                      <td className="px-3 py-2">{r.due ? formatDate(r.due) : ''}</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', d > 0 && 'text-danger')}>{d > 0 ? d : ''}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCAD(r.amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Reports" actions={<PrintButton />}>{nav}</PageHeader>
      <div className="p-5">{body}</div>
    </>
  )
}
