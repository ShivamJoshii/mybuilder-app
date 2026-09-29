import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { costCodes, linkedSubs } from '@/lib/financial'
import { PageHeader } from '@/components/shell/page-header'
import { BillForm } from './bill-form'
import { todayIn } from '@/lib/utils'

export const metadata: Metadata = { title: 'New bill' }

export default async function NewBillPage({ searchParams }: PageProps<'/bills/new'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'client') redirect('/summary')
  const poId = typeof sp.po === 'string' ? sp.po : null
  if (mode === 'sub' && !poId) redirect('/purchase-orders')
  if (mode === 'builder' && !(can(ctx, 'bills', 'add') && can(ctx, 'bills', 'cost'))) redirect('/bills')
  const supabase = await createClient()
  let po = null
  if (poId) {
    const { data: p } = await supabase.from('purchase_orders').select('id,job_id,title,holdback_pct,lien_waiver_required,status').eq('id', poId).maybeSingle()
    if (!p) notFound()
    if (p.status !== 'accepted') redirect(`/purchase-orders/${poId}`)
    const [{ data: items }, { data: billing }, { count }] = await Promise.all([
      supabase.from('po_items').select('id,title,sort').eq('po_id', poId).order('sort'),
      supabase.rpc('po_line_billing', { p_po: poId }),
      supabase.from('bills').select('id', { count: 'exact', head: true }).eq('po_id', poId).eq('is_holdback_release', false),
    ])
    const b = new Map((billing ?? []).map((x) => [x.po_item_id, x]))
    po = { id: p.id, job_id: p.job_id, title: p.title, holdback_pct: Number(p.holdback_pct), lien_waiver_required: p.lien_waiver_required, next: (count ?? 0) + 1,
      lines: (items ?? []).map((i) => ({ id: i.id, title: i.title, total: Number(b.get(i.id)?.line_total ?? 0), billed: Number(b.get(i.id)?.billed ?? 0) })) }
  }
  const builderOrg = mode === 'builder' ? ctx.workspace.orgId : null
  const picked = mode === 'builder' ? selectedJobs(ctx) : []
  return (
    <>
      <PageHeader title={mode === 'sub' ? 'Submit a bill' : 'New bill'} jobName={po?.title} />
      <div className="mx-auto max-w-4xl p-5">
        <BillForm po={po} isSub={mode === 'sub'} today={todayIn(ctx.tz)}
          jobs={(picked.length ? picked : ctx.jobs).map(({ id, title }) => ({ id, title }))}
          subs={builderOrg && !po ? await linkedSubs(builderOrg) : []} codes={builderOrg && !po ? await costCodes(builderOrg) : []} />
      </div>
    </>
  )
}
