import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Plus, Send, Unlock } from 'lucide-react'
import { getAppContext, can, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { costCodes, linkedSubs } from '@/lib/financial'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { PrintButton } from '@/components/kit/print-button'
import { DocHeader, type DocOrg } from '@/components/kit/doc-header'
import { DecisionForm } from '@/components/kit/decision-form'
import { Signatures } from '@/components/kit/signatures'
import { LinesEditor, type Line } from '@/components/kit/lines-editor'
import { Attachments } from '@/components/kit/attachments'
import { formatCAD, formatDate, fullName } from '@/lib/utils'
import { BILL_STATUS, PO_STATUS, WORK_STATUS } from '@/lib/estimate'
import { PoForm } from '../po-form'
import { decidePo, releaseHoldback, releasePo, savePoLines, setWorkStatus, updatePo } from '../actions'

export const metadata: Metadata = { title: 'Purchase order' }

export default async function PoPage({ params }: PageProps<'/purchase-orders/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: po } = await supabase.from('purchase_orders').select('*, sub:organizations!purchase_orders_sub_org_id_fkey(name), builder:organizations!purchase_orders_org_id_fkey(id,name,street,city,province,postal_code,phone,email,logo_url,gst_number,qst_number,updated_at)').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!po) notFound()
  const builder = ctx.workspace.mode === 'builder'
  const canEdit = builder && can(ctx, 'purchase_orders', 'edit')
  const canBill = (builder && can(ctx, 'bills', 'add') && can(ctx, 'bills', 'cost')) || (!builder && po.status === 'accepted')
  const [{ data: items }, { data: billing }, { data: bills }, { data: hb }, { data: jobRow }] = await Promise.all([
    supabase.from('po_items').select('*').eq('po_id', id).order('sort'),
    supabase.rpc('po_line_billing', { p_po: id }),
    supabase.from('bills').select('id,number,invoice_ref,title,status,is_holdback_release,invoice_date,bill_items(amount)').eq('po_id', id).is('deleted_at', null).order('number'),
    supabase.rpc('po_holdback', { p_po: id }),
    supabase.from('jobs').select('title,street,city,province').eq('id', po.job_id).maybeSingle(),
  ])
  const its = (items ?? []).map((i) => ({ ...i, quantity: Number(i.quantity), unit_cost: Number(i.unit_cost) }))
  const billed = new Map((billing ?? []).map((b) => [b.po_item_id, Number(b.billed)]))
  const total = its.reduce((s, i) => s + Math.round(i.quantity * i.unit_cost * 100) / 100, 0)
  const billedTotal = [...billed.values()].reduce((s, v) => s + v, 0)
  const hold = hb?.[0]
  const draft = po.status === 'draft'
  const st = PO_STATUS[po.status]
  const org = po.builder as DocOrg | null
  const payee = (po.sub as { name: string } | null)?.name ?? po.vendor_name

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost"><Link href="/purchase-orders"><ArrowLeft />Purchase orders</Link></Button>
        <div className="flex gap-2">
          <PrintButton />
          {draft && canEdit && (
            <form action={releasePo.bind(null, id)}>
              <ConfirmSubmit variant="primary" title={po.sub_org_id ? `Send to ${payee}?` : 'Issue this PO?'} confirmLabel={po.sub_org_id ? 'Send' : 'Issue'}
                body={po.sub_org_id ? 'They are notified to accept and sign. Lines lock once sent.' : 'One-off vendors have no portal, so the PO is issued as accepted.'}><Send />{po.sub_org_id ? 'Send to sub' : 'Issue PO'}</ConfirmSubmit>
            </form>
          )}
        </div>
      </div>

      {draft && canEdit ? (
        <>
          <Card className="p-5"><PoForm action={updatePo.bind(null, id)} subs={await linkedSubs(po.org_id)} submitLabel="Save details"
            defaults={{ title: po.title, scope: po.scope ?? '', payee: po.sub_org_id ? `s:${po.sub_org_id}` : 'vendor', vendor_name: po.vendor_name ?? '', holdback_pct: Number(po.holdback_pct), lien_waiver_required: po.lien_waiver_required }} /></Card>
          <LinesEditor initial={its as Line[]} codes={await costCodes(po.org_id)} withCost editable save={savePoLines.bind(null, id)} />
        </>
      ) : (
        <Card className="p-6 print:border-0 print:shadow-none">
          <div className="flex flex-wrap justify-between gap-4 border-b border-border pb-4">
            <DocHeader org={org} showTax />
            <div className="text-right text-[13px]">
              <Badge tone={st.tone}>{st.label}</Badge>
              {po.status === 'accepted' && <div className="mt-1"><Badge>{WORK_STATUS[po.work_status]}</Badge></div>}
              {po.released_at && <div className="mt-1 text-text-3">Issued {formatDate(po.released_at)}</div>}
            </div>
          </div>
          <div className="mt-4 text-[13px] text-text-3">Purchase order #{po.number} · {jobRow?.title}{jobRow?.street ? ` · ${[jobRow.street, jobRow.city].filter(Boolean).join(', ')}` : ''}</div>
          <h1 className="text-xl font-semibold">{po.title}</h1>
          <div className="mt-1 text-[13px]">To: <span className="font-medium">{payee}</span> · Holdback {Number(po.holdback_pct)}%{po.lien_waiver_required ? ' · Lien waiver required before payment' : ''}</div>
          {po.scope && <p className="mt-3 whitespace-pre-wrap text-[14px]">{po.scope}</p>}
          <table className="mt-5 w-full text-[13px]">
            <thead className="border-b border-border text-left text-xs text-text-3"><tr><th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Unit cost</th><th className="py-1 text-right">Amount</th><th className="py-1 text-right print:hidden">Billed</th></tr></thead>
            <tbody>
              {its.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="py-1 pr-2">{i.title}{i.description && <div className="text-xs text-text-3">{i.description}</div>}</td>
                  <td className="py-1 text-right">{i.quantity} {i.unit}</td>
                  <td className="py-1 text-right tabular-nums">{formatCAD(i.unit_cost)}</td>
                  <td className="py-1 text-right tabular-nums">{formatCAD(i.quantity * i.unit_cost)}</td>
                  <td className="py-1 text-right tabular-nums text-text-3 print:hidden">{formatCAD(billed.get(i.id) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-border font-semibold"><td colSpan={3} className="py-2 text-right">Total (before GST)</td><td className="py-2 text-right tabular-nums" data-testid="po-total">{formatCAD(total)}</td><td className="py-2 text-right tabular-nums text-text-3 print:hidden">{formatCAD(billedTotal)}</td></tr></tfoot>
          </table>
          {po.signer_name && <Signatures sigs={[{ id: 'po', decision: po.status === 'declined' ? 'declined' : 'approved', signer_name: po.signer_name, on_behalf: false, signature: po.signature, comment: po.decline_reason, signed_at: po.decided_at! }]} />}
        </Card>
      )}

      {po.status === 'released' && (!builder || (canEdit && hasAction(ctx, 'purchase_orders.approve_for_sub'))) && (
        <Card className="print:hidden">
          <CardHeader title={builder ? 'Record the sub’s decision' : 'Accept this purchase order'} />
          <div className="p-4"><DecisionForm action={decidePo.bind(null, id)} needSignature onBehalf={builder} party="sub" approveLabel="Accept"
            agreeText="I accept this work at the prices shown above." defaultName={builder ? '' : fullName(ctx.profile)} /></div>
        </Card>
      )}

      {po.status === 'accepted' && (
        <Card className="print:hidden">
          <CardHeader title="Work and billing" />
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            {(canEdit || !builder) && (
              <form action={setWorkStatus.bind(null, id)} className="flex items-center gap-2">
                <Select name="work_status" aria-label="Work status" className="h-8 w-40" defaultValue={po.work_status}>
                  {Object.entries(WORK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <Button type="submit" size="sm">Update work status</Button>
              </form>
            )}
            {canBill && <Button asChild size="sm" variant="primary" className="ml-auto"><Link href={`/bills/new?po=${id}`}><Plus />{builder ? 'Enter a bill' : 'Submit a bill'}</Link></Button>}
          </div>
          <ul className="divide-y divide-border text-[13px]">
            {(bills ?? []).map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-2">
                <Link href={`/bills/${b.id}`} className="font-medium text-brand hover:underline">{b.invoice_ref || `Bill #${b.number}`}</Link>
                <span className="text-text-3">{b.title}</span>
                <Badge tone={BILL_STATUS[b.status].tone}>{BILL_STATUS[b.status].label}</Badge>
                <span className="ml-auto tabular-nums">{formatCAD((b.bill_items ?? []).reduce((s, i) => s + Number(i.amount), 0))}</span>
              </li>
            ))}
            {(bills ?? []).length === 0 && <li className="px-4 py-3 text-text-3">No bills yet.</li>}
          </ul>
          {hold && Number(hold.withheld) > 0 && (
            <div className="flex flex-wrap items-center gap-4 border-t border-border p-4 text-[13px]">
              <span>Holdback withheld <span className="font-medium tabular-nums">{formatCAD(Number(hold.withheld))}</span></span>
              <span>Released <span className="font-medium tabular-nums">{formatCAD(Number(hold.released))}</span></span>
              <span>Balance <span className="font-medium tabular-nums" data-testid="holdback-balance">{formatCAD(Number(hold.balance))}</span></span>
              {builder && can(ctx, 'bills', 'add') && Number(hold.balance) > 0 && (
                <form action={releaseHoldback.bind(null, id)} className="ml-auto">
                  <ConfirmSubmit size="sm" title="Release holdback?" confirmLabel="Create release bill" body="Creates a draft bill for the holdback balance. Check that the lien period has passed and you have a lien waiver."><Unlock />Release holdback</ConfirmSubmit>
                </form>
              )}
            </div>
          )}
        </Card>
      )}
      <Attachments jobId={po.job_id} recordType="purchase_order" recordId={id} path={`/purchase-orders/${id}`} share={{ subs: Boolean(po.sub_org_id), clients: false }} canAdd={canEdit} />
    </div>
  )
}
