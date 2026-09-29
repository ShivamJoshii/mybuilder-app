import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Send, Trash2 } from 'lucide-react'
import { getAppContext, can, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ActionForm } from '@/components/kit/action-form'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { PrintButton } from '@/components/kit/print-button'
import { DocHeader, DOC_ORG_COLUMNS } from '@/components/kit/doc-header'
import { DecisionForm } from '@/components/kit/decision-form'
import { Signatures } from '@/components/kit/signatures'
import { Worksheet, type CatalogItem } from '@/components/kit/cost-worksheet'
import { formatCAD, formatDate, fullName } from '@/lib/utils'
import { CO_STATUS, totals, type EstItem, type SnapshotLine } from '@/lib/estimate'
import { decideChangeOrder, deleteChangeOrder, releaseChangeOrder, saveChangeOrderLines, updateChangeOrder } from '../actions'

export const metadata: Metadata = { title: 'Change order' }

export default async function ChangeOrderPage({ params }: PageProps<'/change-orders/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  if (ctx.workspace.mode === 'sub') redirect('/summary')
  const supabase = await createClient()
  const { data: co } = await supabase.from('change_orders').select('*').eq('id', id).maybeSingle()
  if (!co) notFound()
  const builder = ctx.workspace.mode === 'builder'
  const isClient = ctx.workspace.mode === 'client'
  const canEdit = builder && can(ctx, 'change_orders', 'edit')
  const canDelete = builder && can(ctx, 'change_orders', 'delete')
  const seeCost = builder && can(ctx, 'change_orders', 'cost')
  const draft = co.status === 'draft'

  const { data: priv } = builder ? await supabase.from('change_order_private').select('internal_notes,default_markup_pct').eq('change_order_id', id).maybeSingle() : { data: null }
  const [{ data: org }, { data: job }, { data: sigs }] = await Promise.all([
    supabase.from('organizations').select(DOC_ORG_COLUMNS).eq('id', co.org_id).single(),
    supabase.from('jobs').select('title,street,city,province').eq('id', co.job_id).single(),
    supabase.from('change_order_signatures').select('*').eq('change_order_id', id).order('signed_at'),
  ])

  let lines: SnapshotLine[] = (co.snapshot as SnapshotLine[] | null) ?? []
  let sums = { subtotal: Number(co.subtotal ?? 0), tax: Number(co.tax ?? 0), total: Number(co.total ?? 0) }
  let items: EstItem[] = []
  let codes: { id: string; code: string; title: string }[] = []
  let catalog: CatalogItem[] = []
  if (draft && builder) {
    const { data: pl } = await supabase.rpc('co_price_lines', { p_co: id })
    lines = (pl ?? []).map((l) => ({ title: l.title, description: l.description, quantity: Number(l.quantity), unit: l.unit, price: Number(l.price), taxable: l.taxable }))
    const t = totals(lines.map((l, i) => ({ id: String(i), group_id: null, cost_code_id: null, cost_type: 'none', title: l.title, description: null, internal_notes: null,
      quantity: 1, unit: 'ea', unit_cost: l.price, markup_type: 'amount', markup_value: 0, taxable: l.taxable, marked_as: 'none', sort: i })), [], Number(co.tax_rate))
    sums = { subtotal: t.price, tax: t.tax, total: t.total }
    if (seeCost) {
      const [{ data: its }, { data: cc }, { data: cat }] = await Promise.all([
        supabase.from('change_order_items').select('*').eq('change_order_id', id).order('sort'),
        supabase.from('cost_codes').select('id,code,title').eq('org_id', co.org_id).eq('is_active', true).order('code'),
        supabase.from('cost_items').select('id,title,description,unit,unit_cost,cost_type,markup_type,markup_value,taxable,cost_code_id').eq('org_id', co.org_id).eq('is_active', true).order('title'),
      ])
      items = (its ?? []).map((i) => ({ ...i, group_id: null, marked_as: 'none' as const, quantity: Number(i.quantity), unit_cost: Number(i.unit_cost), markup_value: Number(i.markup_value) }))
      codes = cc ?? []
      catalog = (cat ?? []).map((c) => ({ ...c, unit_cost: Number(c.unit_cost), markup_value: Number(c.markup_value) }))
    }
  }
  const st = draft && co.requested_by_client ? { label: 'Requested', tone: 'warning' as const } : CO_STATUS[co.status]
  const taxLabel = `${co.tax_label} (${Number(co.tax_rate)}%)`

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost"><Link href="/change-orders"><ArrowLeft />Change orders</Link></Button>
        <div className="flex gap-2">
          <PrintButton />
          {draft && canDelete && (
            <form action={deleteChangeOrder.bind(null, id)}><ConfirmSubmit variant="ghost" title="Delete this change order?" body="The draft and its lines will be removed."><Trash2 />Delete</ConfirmSubmit></form>
          )}
          {draft && canEdit && lines.length > 0 && (
            <form action={releaseChangeOrder.bind(null, id)}>
              <ConfirmSubmit variant="primary" title="Release to the client?" confirmLabel="Release"
                body="Prices are frozen and the client is asked to approve and sign. When they approve, the budget and contract price update."><Send />Release to client</ConfirmSubmit>
            </form>
          )}
        </div>
      </div>

      {draft && isClient && <Alert tone="info">Your builder is reviewing this request. You&apos;ll be notified when it&apos;s priced and ready to approve.</Alert>}
      {draft && co.requested_by_client && builder && <Alert tone="info">Your client requested this change. Price it below, then release it for their approval.</Alert>}

      {draft && canEdit && (
        <Card className="print:hidden">
          <CardHeader title="Details" />
          <ActionForm action={updateChangeOrder.bind(null, id)} resetOnSuccess={false} className="grid gap-3 p-4 md:grid-cols-2">
            <label className="text-[13px] font-medium text-text-2 md:col-span-2">Title<Input name="title" className="mt-1" defaultValue={co.title} required maxLength={200} /></label>
            <label className="text-[13px] font-medium text-text-2">Description (client sees this)<Textarea name="description" className="mt-1" defaultValue={co.description ?? ''} rows={3} maxLength={8000} /></label>
            <label className="text-[13px] font-medium text-text-2">Internal notes<Textarea name="internal_notes" className="mt-1" defaultValue={priv?.internal_notes ?? ''} rows={3} maxLength={8000} /></label>
            <label className="text-[13px] font-medium text-text-2">Approval deadline<Input type="date" name="approval_deadline" className="mt-1" defaultValue={co.approval_deadline ?? ''} /></label>
            <label className="flex items-center gap-2 self-end text-[13px] text-text-2"><Checkbox name="collect_signature" defaultChecked={co.collect_signature} /> Require a signature to approve</label>
            <div className="md:col-span-2"><Button type="submit">Save details</Button></div>
          </ActionForm>
        </Card>
      )}
      {draft && seeCost && (
        <div className="print:hidden">
          <Worksheet key={co.id} save={saveChangeOrderLines.bind(null, id)} editable={canEdit} withGroups={false} saveLabel="Save lines"
            initial={{ settings: { default_markup_pct: Number(priv?.default_markup_pct ?? 20), tax_rate: Number(co.tax_rate), tax_label: co.tax_label }, groups: [], items }}
            codes={codes} catalog={catalog} />
        </div>
      )}

      <Card className="p-6 print:border-0 print:shadow-none">
        <div className="flex flex-wrap justify-between gap-4 border-b border-border pb-4">
          <DocHeader org={org} />
          <div className="text-right text-[13px]">
            <Badge tone={st.tone}>{st.label}</Badge>
            <div className="mt-1 text-text-3">{co.released_at ? `Issued ${formatDate(co.released_at)}` : 'Not yet released'}</div>
            {co.approval_deadline && <div className="text-text-3">Respond by {formatDate(co.approval_deadline)}</div>}
          </div>
        </div>
        <div className="mt-4 text-[13px] text-text-3">Change order #{co.number} · {job?.title}</div>
        <h1 className="text-xl font-semibold">{co.title}</h1>
        {co.description && <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed">{co.description}</p>}
        {builder && priv?.internal_notes && <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-[13px] print:hidden"><span className="font-medium">Internal: </span>{priv.internal_notes}</p>}

        {lines.length > 0 && (
          <>
            <table className="mt-5 w-full text-[13px]">
              <thead className="border-b border-border text-left text-xs text-text-3"><tr><th className="py-1">Item</th><th className="w-28 py-1 text-right">Qty</th><th className="w-32 py-1 text-right">Price</th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-1 pr-2">{l.title}{l.description && <div className="whitespace-pre-wrap text-xs text-text-3">{l.description}</div>}</td>
                    <td className="py-1 text-right text-text-3">{Number(l.quantity)} {l.unit}</td>
                    <td className="py-1 text-right tabular-nums">{formatCAD(Number(l.price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-[14px]">
              <div className="flex justify-between"><span className="text-text-3">Subtotal</span><span className="tabular-nums">{formatCAD(sums.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-text-3">{taxLabel}</span><span className="tabular-nums">{formatCAD(sums.tax)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 text-base font-semibold"><span>Total</span><span className="tabular-nums" data-testid="co-total">{formatCAD(sums.total)}</span></div>
            </div>
          </>
        )}
        {lines.length === 0 && !isClient && <p className="mt-5 text-[13px] text-text-3">Add lines above to price this change.</p>}
        <Signatures sigs={sigs ?? []} />
      </Card>

      {co.status === 'pending' && (isClient || (canEdit && hasAction(ctx, 'change_orders.approve_for_client'))) && (
        <Card className="print:hidden">
          <CardHeader title={isClient ? 'Your decision' : 'Record the client’s decision'} />
          <div className="p-4">
            <DecisionForm action={decideChangeOrder.bind(null, id)} needSignature={co.collect_signature} onBehalf={!isClient} defaultName={isClient ? fullName(ctx.profile) : ''} />
          </div>
        </Card>
      )}
    </div>
  )
}
