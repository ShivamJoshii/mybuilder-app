import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, ShoppingCart } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCAD } from '@/lib/utils'
import { PO_STATUS, WORK_STATUS } from '@/lib/estimate'
import { forJobs } from '@/lib/job-filter'

export const metadata: Metadata = { title: 'Purchase orders' }

export default async function PurchaseOrdersPage() {
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'client') redirect('/summary')
  if (mode === 'builder' && !(can(ctx, 'purchase_orders') && can(ctx, 'purchase_orders', 'cost'))) redirect('/summary?denied=purchase_orders')
  const supabase = await createClient()
  const picked = mode === 'builder' ? selectedJobs(ctx) : []
  let q = supabase.from('purchase_orders').select('id,number,title,status,work_status,job_id,vendor_name,sub:organizations!purchase_orders_sub_org_id_fkey(name),jobs(title),po_items(quantity,unit_cost),bills(status,deleted_at,is_holdback_release,bill_items(amount))')
    .is('deleted_at', null).order('created_at', { ascending: false })
  if (mode === 'builder') q = forJobs(q, ctx, picked.map((j) => j.id))
  const { data: pos } = mode === 'builder' && !picked.length ? { data: [] } : await q
  const canAdd = mode === 'builder' && can(ctx, 'purchase_orders', 'add')
  const rows = (pos ?? []).map((p) => {
    const total = (p.po_items ?? []).reduce((s, i) => s + Math.round(Number(i.quantity) * Number(i.unit_cost) * 100) / 100, 0)
    const billed = (p.bills ?? []).filter((b) => !b.deleted_at && !b.is_holdback_release && b.status !== 'rejected')
      .reduce((s, b) => s + (b.bill_items ?? []).reduce((t, i) => t + Number(i.amount), 0), 0)
    return { ...p, total, billed }
  })
  return (
    <>
      <PageHeader title="Purchase orders" jobName={mode === 'builder' ? selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length) : null}
        actions={canAdd && <Button asChild variant="primary"><Link href="/purchase-orders/new"><Plus />New purchase order</Link></Button>} />
      {mode === 'builder' && picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="p-5">
        {rows.length === 0 ? (
          <EmptyState icon={ShoppingCart} title={mode === 'sub' ? 'No purchase orders yet' : 'Commit costs with POs'}
            body={mode === 'sub' ? 'Purchase orders from your builders show up here to accept and bill against.' : 'Issue purchase orders to your trades, collect sign-off, track work and bill against them with holdback.'}
            action={canAdd ? <Button asChild variant="primary"><Link href="/purchase-orders/new"><Plus />New purchase order</Link></Button> : undefined} />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="w-12 px-4 py-2">#</th><th className="px-4 py-2">Title</th><th className="px-4 py-2">Job</th>{mode === 'builder' && <th className="px-4 py-2">Sub / vendor</th>}<th className="px-4 py-2">Status</th><th className="px-4 py-2">Work</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">Billed</th></tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 text-text-3">{p.number}</td>
                    <td className="px-4 py-2"><Link href={`/purchase-orders/${p.id}`} className="font-medium text-brand hover:underline">{p.title}</Link></td>
                    <td className="px-4 py-2">{(p.jobs as { title: string } | null)?.title}</td>
                    {mode === 'builder' && <td className="px-4 py-2">{(p.sub as { name: string } | null)?.name ?? p.vendor_name}</td>}
                    <td className="px-4 py-2"><Badge tone={PO_STATUS[p.status].tone}>{PO_STATUS[p.status].label}</Badge></td>
                    <td className="px-4 py-2">{p.status === 'accepted' ? WORK_STATUS[p.work_status] : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCAD(p.total)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCAD(p.billed)}</td>
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
