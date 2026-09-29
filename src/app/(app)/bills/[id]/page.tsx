import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, FileCheck2, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { getAppContext, can, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Input, Select } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { Attachments } from '@/components/kit/attachments'
import { formatCAD, formatDate, formatDateTime, todayIn } from '@/lib/utils'
import { BILL_STATUS, PAYMENT_METHODS } from '@/lib/estimate'
import { billStatus, deleteBill, payBill } from '../actions'
import { ComplianceBanner } from '@/components/kit/compliance-banner'

export const metadata: Metadata = { title: 'Bill' }

export default async function BillPage({ params }: PageProps<'/bills/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: b } = await supabase.from('bills').select('*, sub:organizations!bills_sub_org_id_fkey(name), po:purchase_orders(id,number,title)').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!b) notFound()
  const { data: items } = await supabase.from('bill_items').select('id,title,amount,cost_code_id,cost_codes(code,title)').eq('bill_id', id).order('sort')
  const builder = ctx.workspace.mode === 'builder'
  const canEdit = builder && can(ctx, 'bills', 'edit')
  const canApprove = canEdit && hasAction(ctx, 'bills.approve')
  const canPay = canEdit && hasAction(ctx, 'bills.mark_paid')
  const subtotal = (items ?? []).reduce((s, i) => s + Number(i.amount), 0)
  const hb = Math.round(subtotal * Number(b.holdback_pct)) / 100
  const payable = subtotal + Number(b.tax_amount) - hb
  const st = BILL_STATUS[b.status]
  const po = b.po as { id: string; number: number; title: string } | null
  const job = ctx.jobs.find((j) => j.id === b.job_id)
  const waiverMissing = b.lien_waiver_required && !b.lien_waiver_received_at

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost"><Link href="/bills"><ArrowLeft />Bills</Link></Button>
        <div className="flex flex-wrap gap-2">
          {canApprove && ['draft', 'submitted'].includes(b.status) && <form action={billStatus.bind(null, id, 'approve')}><Button type="submit" variant="primary"><CheckCircle2 />Approve</Button></form>}
          {canApprove && b.status === 'approved' && <form action={billStatus.bind(null, id, 'unapprove')}><Button type="submit"><RotateCcw />Unapprove</Button></form>}
          {canEdit && waiverMissing && ['approved', 'draft', 'submitted'].includes(b.status) && <form action={billStatus.bind(null, id, 'lien_waiver')}><Button type="submit"><FileCheck2 />Lien waiver received</Button></form>}
          {canEdit && b.status === 'draft' && <form action={deleteBill.bind(null, id)}><ConfirmSubmit variant="ghost" title="Delete this bill?" body="The draft bill moves to the trash."><Trash2 />Delete</ConfirmSubmit></form>}
        </div>
      </div>
      {builder && b.status !== 'paid' && <ComplianceBanner builderId={b.org_id} subId={b.sub_org_id} />}
      <Card className="p-5">
        <div className="text-[13px] text-text-3">{job?.title} · Bill #{b.number}{po ? <> · <Link href={`/purchase-orders/${po.id}`} className="text-brand hover:underline">PO #{po.number} {po.title}</Link></> : null}</div>
        <h1 className="text-xl font-semibold">{b.invoice_ref ? `Invoice ${b.invoice_ref}` : b.title}</h1>
        {b.invoice_ref && <div className="text-[13px]">{b.title}</div>}
        <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
          <Badge tone={st.tone}>{st.label}</Badge>
          {b.is_holdback_release && <Badge>Holdback release</Badge>}
          <Badge>From {(b.sub as { name: string } | null)?.name ?? b.vendor_name}</Badge>
          <Badge>Dated {formatDate(b.invoice_date)}</Badge>
          {b.due_date && <Badge tone={b.due_date < todayIn(ctx.tz) && b.status === 'approved' ? 'danger' : 'neutral'}>Due {formatDate(b.due_date)}</Badge>}
          {b.lien_waiver_required && <Badge tone={waiverMissing ? 'warning' : 'success'}>{waiverMissing ? 'Lien waiver needed' : `Lien waiver received ${formatDateTime(b.lien_waiver_received_at, ctx.tz)}`}</Badge>}
        </div>
        {b.rejected_reason && <Alert className="mt-3">Rejected: {b.rejected_reason}</Alert>}
        <table className="mt-5 w-full text-[13px]">
          <thead className="border-b border-border text-left text-xs text-text-3"><tr><th className="py-1">Line</th><th className="py-1">Cost code</th><th className="py-1 text-right">Amount</th></tr></thead>
          <tbody>
            {(items ?? []).map((i) => (
              <tr key={i.id}><td className="py-1">{i.title}</td><td className="py-1 text-text-3">{(i.cost_codes as { code: string; title: string } | null)?.code}</td><td className="py-1 text-right tabular-nums">{formatCAD(Number(i.amount))}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-[14px]">
          <div className="flex justify-between"><span className="text-text-3">Subtotal</span><span className="tabular-nums">{formatCAD(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-text-3">GST / tax</span><span className="tabular-nums">{formatCAD(Number(b.tax_amount))}</span></div>
          {hb > 0 && <div className="flex justify-between"><span className="text-text-3">Holdback ({Number(b.holdback_pct)}%)</span><span className="tabular-nums">−{formatCAD(hb)}</span></div>}
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold"><span>{b.status === 'paid' ? 'Paid' : 'Payable'}</span><span className="tabular-nums" data-testid="bill-amount">{formatCAD(b.status === 'paid' ? Number(b.paid_amount) : payable)}</span></div>
          {b.status === 'paid' && <div className="text-xs text-text-3">Paid {formatDate(b.paid_at)} by {PAYMENT_METHODS[b.payment_method ?? 'other']}{b.payment_ref ? ` · ${b.payment_ref}` : ''}</div>}
        </div>
      </Card>

      {canEdit && b.status === 'submitted' && (
        <Card>
          <CardHeader title="Reject this bill" description="The sub sees your reason and can submit a corrected bill." />
          <form action={billStatus.bind(null, id, 'reject')} className="flex flex-wrap gap-2 p-4">
            <Input name="reason" aria-label="Reason" placeholder="Reason" className="max-w-md" required maxLength={2000} />
            <Button type="submit"><XCircle />Reject</Button>
          </form>
        </Card>
      )}
      {canPay && b.status === 'approved' && (
        <Card>
          <CardHeader title="Record payment" description={waiverMissing ? 'Mark the lien waiver as received before paying.' : 'Money moves outside MyBuilder for now; this records it.'} />
          <ActionForm action={payBill.bind(null, id)} className="flex flex-wrap items-end gap-3 p-4">
            <label className="text-[13px] font-medium text-text-2">Paid on<Input name="paid_on" type="date" className="mt-1" defaultValue={todayIn(ctx.tz)} required /></label>
            <label className="text-[13px] font-medium text-text-2">Method<Select name="method" className="mt-1 w-44" defaultValue="eft">{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></label>
            <label className="text-[13px] font-medium text-text-2">Reference<Input name="ref" className="mt-1 w-40" maxLength={80} placeholder="Cheque # / EFT ref" /></label>
            <Button type="submit" variant="primary" disabled={waiverMissing}>Record {formatCAD(payable)} paid</Button>
          </ActionForm>
        </Card>
      )}
      <Attachments jobId={b.job_id} recordType="bill" recordId={id} path={`/bills/${id}`} share={{ subs: Boolean(b.sub_org_id), clients: false }} canAdd={canEdit || (!builder && b.status === 'submitted')} />
    </div>
  )
}
