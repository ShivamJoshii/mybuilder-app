import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Receipt } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCAD, formatDate, todayIn } from '@/lib/utils'
import { BILL_STATUS } from '@/lib/estimate'

export const metadata: Metadata = { title: 'Bills' }

export default async function BillsPage({ searchParams }: PageProps<'/bills'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'client') redirect('/summary')
  if (mode === 'builder' && !(can(ctx, 'bills') && can(ctx, 'bills', 'cost'))) redirect('/summary?denied=bills')
  const status = typeof sp.status === 'string' && sp.status in BILL_STATUS ? sp.status : ''
  const supabase = await createClient()
  const picked = mode === 'builder' ? selectedJobs(ctx) : []
  let q = supabase.from('bills').select('id,number,invoice_ref,title,status,invoice_date,due_date,tax_amount,holdback_pct,paid_amount,job_id,vendor_name,is_holdback_release,sub:organizations!bills_sub_org_id_fkey(name),jobs(title),bill_items(amount)')
    .is('deleted_at', null).order('invoice_date', { ascending: false })
  if (mode === 'builder') q = q.in('job_id', picked.map((j) => j.id))
  if (status) q = q.eq('status', status as 'draft')
  const { data: bills } = mode === 'builder' && !picked.length ? { data: [] } : await q
  const today = todayIn()
  const rows = (bills ?? []).map((b) => {
    const sub = (b.bill_items ?? []).reduce((s, i) => s + Number(i.amount), 0)
    const hb = Math.round(sub * Number(b.holdback_pct)) / 100
    return { ...b, sub_total: sub, hb, payable: sub + Number(b.tax_amount) - hb }
  })
  const owing = rows.filter((r) => r.status === 'approved').reduce((s, r) => s + r.payable, 0)
  const canAdd = mode === 'builder' && can(ctx, 'bills', 'add')

  return (
    <>
      <PageHeader title="Bills" jobName={mode === 'builder' ? selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length) : null}
        actions={canAdd && <Button asChild variant="primary"><Link href="/bills/new"><Plus />New bill</Link></Button>} />
      {mode === 'builder' && picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-1 text-[13px]">
          {[['', 'All'], ...Object.entries(BILL_STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
            <Link key={k} href={k ? `/bills?status=${k}` : '/bills'} className={`rounded-full border px-3 py-1 ${status === k ? 'border-brand bg-brand-soft text-brand' : 'border-border text-text-2'}`}>{l}</Link>
          ))}
          {mode === 'builder' && owing > 0 && <span className="ml-auto text-text-3">Approved, unpaid: <span className="font-medium text-text tabular-nums">{formatCAD(owing)}</span></span>}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Receipt} title={mode === 'sub' ? 'No bills yet' : 'Pay trades on time'} body={mode === 'sub' ? 'Bill your builder from an accepted purchase order.' : 'Bills from POs, approvals, holdback and lien waivers in one place.'}
            action={canAdd ? <Button asChild variant="primary"><Link href="/bills/new"><Plus />New bill</Link></Button> : undefined} />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="px-4 py-2">Bill</th><th className="px-4 py-2">Job</th>{mode === 'builder' && <th className="px-4 py-2">From</th>}<th className="px-4 py-2">Status</th><th className="px-4 py-2">Due</th><th className="px-4 py-2 text-right">Subtotal</th><th className="px-4 py-2 text-right">Holdback</th><th className="px-4 py-2 text-right">Payable</th></tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((b) => {
                  const overdue = b.due_date && b.due_date < today && b.status === 'approved'
                  return (
                    <tr key={b.id}>
                      <td className="px-4 py-2"><Link href={`/bills/${b.id}`} className="font-medium text-brand hover:underline">{b.invoice_ref || `Bill #${b.number}`}</Link><div className="text-xs text-text-3">{b.title}</div></td>
                      <td className="px-4 py-2">{(b.jobs as { title: string } | null)?.title}</td>
                      {mode === 'builder' && <td className="px-4 py-2">{(b.sub as { name: string } | null)?.name ?? b.vendor_name}</td>}
                      <td className="px-4 py-2"><Badge tone={BILL_STATUS[b.status].tone}>{BILL_STATUS[b.status].label}</Badge>{b.is_holdback_release && <Badge className="ml-1">Holdback release</Badge>}</td>
                      <td className={`px-4 py-2 ${overdue ? 'font-medium text-danger' : ''}`}>{b.due_date ? formatDate(b.due_date) : ''}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCAD(b.sub_total)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{b.hb ? formatCAD(b.hb) : ''}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCAD(b.status === 'paid' ? Number(b.paid_amount) : b.payable)}</td>
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
