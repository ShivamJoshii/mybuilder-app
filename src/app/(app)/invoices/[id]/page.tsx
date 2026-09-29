import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Ban, Send, X } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { PrintButton } from '@/components/kit/print-button'
import { formatCAD, formatDate, todayIn } from '@/lib/utils'
import { INVOICE_STATUS, PAYMENT_METHODS } from '@/lib/estimate'
import { InvoiceForm } from '../invoice-form'
import { InvoiceLines, type InvLine } from './invoice-lines'
import { recordPayment, releaseInvoice, removePayment, saveInvoiceLines, updateInvoice, voidInvoice } from '../actions'

export const metadata: Metadata = { title: 'Invoice' }

export default async function InvoicePage({ params }: PageProps<'/invoices/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  if (ctx.workspace.mode === 'sub') redirect('/summary')
  const supabase = await createClient()
  const { data: inv } = await supabase.from('client_invoices').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!inv) notFound()
  const builder = ctx.workspace.mode === 'builder'
  const canEdit = builder && can(ctx, 'invoices', 'edit')
  const [{ data: lines }, { data: tot }, { data: pays }, { data: org }, { data: job }] = await Promise.all([
    supabase.from('client_invoice_lines').select('*').eq('invoice_id', id).order('sort'),
    supabase.rpc('invoice_totals', { p: id }),
    supabase.from('client_payments').select('*').eq('invoice_id', id).order('paid_on'),
    supabase.from('organizations').select('name,street,city,province,postal_code,phone,email').eq('id', inv.org_id).single(),
    supabase.from('jobs').select('title,street,city,province,postal_code').eq('id', inv.job_id).single(),
  ])
  const t = tot?.[0]
  const st = INVOICE_STATUS[inv.status]
  const draft = inv.status === 'draft'

  let editor = null
  if (draft && canEdit) {
    const [{ data: contract }, { data: others }, { data: cos }] = await Promise.all([
      supabase.rpc('job_contract', { p_job: inv.job_id }),
      supabase.from('client_invoices').select('id,status,client_invoice_lines(amount,change_order_id)').eq('job_id', inv.job_id).neq('id', id).in('status', ['released', 'paid']).is('deleted_at', null),
      supabase.from('change_orders').select('id,number,title,subtotal').eq('job_id', inv.job_id).eq('status', 'approved').order('number'),
    ])
    const billedBefore = (others ?? []).flatMap((o) => o.client_invoice_lines ?? []).reduce((s, l) => s + Number(l.amount), 0)
    const invoicedCos = new Set((others ?? []).flatMap((o) => o.client_invoice_lines ?? []).map((l) => l.change_order_id).filter(Boolean))
    editor = (
      <>
        <Card className="p-5">
          <InvoiceForm action={updateInvoice.bind(null, id)} withTax submitLabel="Save details"
            defaults={{ title: inv.title, description: inv.description ?? '', invoice_date: inv.invoice_date, due_date: inv.due_date ?? '', holdback_pct: Number(inv.holdback_pct), tax_rate: Number(inv.tax_rate), tax_label: inv.tax_label }} />
        </Card>
        <InvoiceLines save={saveInvoiceLines.bind(null, id)} contract={Number(contract ?? 0)} billedBefore={billedBefore} taxRate={Number(inv.tax_rate)} taxLabel={inv.tax_label} holdbackPct={Number(inv.holdback_pct)}
          cos={(cos ?? []).filter((c) => !invoicedCos.has(c.id)).map((c) => ({ id: c.id, number: c.number, title: c.title, subtotal: Number(c.subtotal ?? 0) }))}
          initial={(lines ?? []).map((l) => ({ kind: l.kind as InvLine['kind'], change_order_id: l.change_order_id, title: l.title, percent: l.percent != null ? Number(l.percent) : null, amount: Number(l.amount), taxable: l.taxable, sort: l.sort }))} />
      </>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost"><Link href="/invoices"><ArrowLeft />Invoices</Link></Button>
        <div className="flex gap-2">
          <PrintButton />
          {canEdit && ['draft', 'released'].includes(inv.status) && !(pays ?? []).length && (
            <form action={voidInvoice.bind(null, id)}><ConfirmSubmit variant="ghost" title="Void this invoice?" confirmLabel="Void" body="The client no longer owes it. This can't be undone."><Ban />Void</ConfirmSubmit></form>
          )}
          {draft && canEdit && (
            <form action={releaseInvoice.bind(null, id)}>
              <ConfirmSubmit variant="primary" title="Send to the client?" confirmLabel="Send" body="The client is notified and can view and print it. Lines lock once sent."><Send />Send to client</ConfirmSubmit>
            </form>
          )}
        </div>
      </div>
      {editor}
      {!editor && (
        <Card className="p-6 print:border-0 print:shadow-none">
          <div className="flex flex-wrap justify-between gap-4 border-b border-border pb-4">
            <div>
              <div className="text-lg font-semibold">{org?.name}</div>
              <div className="text-[13px] text-text-3">{[org?.street, org?.city, org?.province, org?.postal_code].filter(Boolean).join(', ')}</div>
              <div className="text-[13px] text-text-3">{[org?.phone, org?.email].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="text-right text-[13px]">
              <div className="text-lg font-semibold">Invoice #{inv.number}</div>
              <Badge tone={st.tone}>{st.label}</Badge>
              <div className="mt-1 text-text-3">Dated {formatDate(inv.invoice_date)}</div>
              {inv.due_date && <div className="text-text-3">Due {formatDate(inv.due_date)}</div>}
            </div>
          </div>
          <div className="mt-4 text-[13px] text-text-3">{job?.title}{job?.street ? ` · ${[job.street, job.city, job.province, job.postal_code].filter(Boolean).join(', ')}` : ''}</div>
          <h1 className="text-xl font-semibold">{inv.title}</h1>
          {inv.description && <p className="mt-3 whitespace-pre-wrap text-[14px]">{inv.description}</p>}
          <table className="mt-5 w-full text-[13px]">
            <thead className="border-b border-border text-left text-xs text-text-3"><tr><th className="py-1">Description</th><th className="py-1 text-right">Amount</th></tr></thead>
            <tbody>{(lines ?? []).map((l) => <tr key={l.id}><td className="py-1">{l.title}{l.kind === 'percent' && l.percent != null ? <span className="text-text-3"> ({Number(l.percent)}% of contract)</span> : null}</td><td className="py-1 text-right tabular-nums">{formatCAD(Number(l.amount))}</td></tr>)}</tbody>
          </table>
          {t && (
            <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-[14px]">
              <div className="flex justify-between"><span className="text-text-3">Subtotal</span><span className="tabular-nums">{formatCAD(Number(t.subtotal))}</span></div>
              <div className="flex justify-between"><span className="text-text-3">{inv.tax_label} ({Number(inv.tax_rate)}%)</span><span className="tabular-nums">{formatCAD(Number(t.tax))}</span></div>
              {Number(t.holdback) > 0 && <div className="flex justify-between"><span className="text-text-3">Holdback ({Number(inv.holdback_pct)}%)</span><span className="tabular-nums">−{formatCAD(Number(t.holdback))}</span></div>}
              <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{formatCAD(Number(t.total))}</span></div>
              {Number(t.paid) !== 0 && <div className="flex justify-between"><span className="text-text-3">Paid</span><span className="tabular-nums">−{formatCAD(Number(t.paid))}</span></div>}
              <div className="flex justify-between text-base font-semibold"><span>Balance due</span><span className="tabular-nums" data-testid="invoice-balance">{formatCAD(Number(t.balance))}</span></div>
            </div>
          )}
        </Card>
      )}
      {!draft && (
        <Card className="print:hidden">
          <CardHeader title="Payments" />
          <ul className="divide-y divide-border text-[13px]">
            {(pays ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                <span>{formatDate(p.paid_on)}</span><span className="text-text-3">{PAYMENT_METHODS[p.method]}{p.reference ? ` · ${p.reference}` : ''}</span>
                <span className="ml-auto tabular-nums">{formatCAD(Number(p.amount))}</span>
                {canEdit && <form action={removePayment.bind(null, id, p.id)}><Button type="submit" size="icon" variant="ghost" aria-label="Remove payment"><X /></Button></form>}
              </li>
            ))}
            {(pays ?? []).length === 0 && <li className="px-4 py-3 text-text-3">No payments yet.</li>}
          </ul>
          {canEdit && inv.status === 'released' && (
            <ActionForm action={recordPayment.bind(null, id)} className="flex flex-wrap items-end gap-3 border-t border-border p-4">
              <label className="text-[13px] font-medium text-text-2">Received on<Input name="paid_on" type="date" className="mt-1" defaultValue={todayIn()} required /></label>
              <label className="text-[13px] font-medium text-text-2">Amount<Input name="amount" type="number" step="0.01" className="mt-1 w-36" defaultValue={t ? Number(t.balance).toFixed(2) : ''} required /></label>
              <label className="text-[13px] font-medium text-text-2">Method<Select name="method" className="mt-1 w-44" defaultValue="eft">{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></label>
              <label className="text-[13px] font-medium text-text-2">Reference<Input name="ref" className="mt-1 w-36" maxLength={80} /></label>
              <Button type="submit" variant="primary">Record payment</Button>
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  )
}
