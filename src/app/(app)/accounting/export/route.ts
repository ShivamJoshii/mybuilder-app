import { NextResponse, type NextRequest } from 'next/server'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { toCsv } from '@/lib/csv'

const DEFAULT_ACCOUNTS: Record<string, string> = { labor: 'Job Labour', material: 'Job Materials', subcontractor: 'Subcontractors', equipment: 'Equipment Rental', other: 'Job Expenses', none: 'Job Expenses' }
const isDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)

/** CSV exports shaped for QuickBooks Online import (bills, invoices) plus a payments register. */
export async function GET(req: NextRequest) {
  const ctx = await getAppContext()
  if (ctx.workspace.mode !== 'builder' || !can(ctx, 'accounting')) return new NextResponse('Forbidden', { status: 403 })
  const kind = req.nextUrl.searchParams.get('kind')
  const from = isDate(req.nextUrl.searchParams.get('from')) ?? '2000-01-01'
  const to = isDate(req.nextUrl.searchParams.get('to')) ?? '2999-12-31'
  const org = ctx.workspace.orgId
  const supabase = await createClient()
  const { data: settings } = await supabase.from('accounting_settings').select('accounts,code_accounts,income_item').eq('org_id', org).maybeSingle()
  const accounts = { ...DEFAULT_ACCOUNTS, ...((settings?.accounts ?? {}) as Record<string, string>) }
  const codeAccounts = (settings?.code_accounts ?? {}) as Record<string, string>
  const account = (costCode: string | null, type: string) => (costCode && codeAccounts[costCode]) || accounts[type] || 'Job Expenses'
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  let rows: (string | number | null)[][] = []

  if (kind === 'bills') {
    if (!can(ctx, 'bills', 'cost')) return new NextResponse('Forbidden', { status: 403 })
    const { data } = await supabase.from('bills').select('number,invoice_ref,title,invoice_date,due_date,tax_amount,holdback_pct,job_id,vendor_name,sub:organizations!bills_sub_org_id_fkey(name),bill_items(title,amount,cost_code_id,cost_type,cost_codes(code))')
      .eq('org_id', org).in('status', ['approved', 'paid']).is('deleted_at', null).gte('invoice_date', from).lte('invoice_date', to).order('invoice_date')
    rows = [['Bill No.', 'Supplier', 'Bill Date', 'Due Date', 'Memo', 'Account', 'Line Description', 'Line Amount', 'Line Tax Code', 'Line Tax Amount', 'Customer / Job']]
    for (const b of data ?? []) {
      const items = b.bill_items ?? []
      items.forEach((i, n) => {
        // the vendor's GST goes on the first line so the bill total matches their invoice
        rows.push([b.invoice_ref || `B${b.number}`, (b.sub as { name: string } | null)?.name ?? b.vendor_name, b.invoice_date, b.due_date, [b.title, Number(b.holdback_pct) ? `Holdback ${Number(b.holdback_pct)}% withheld` : ''].filter(Boolean).join(' — '),
          account(i.cost_code_id, i.cost_type), [(i.cost_codes as { code: string } | null)?.code, i.title].filter(Boolean).join(' '), Number(i.amount).toFixed(2),
          n === 0 && Number(b.tax_amount) ? 'GST' : '', n === 0 ? Number(b.tax_amount).toFixed(2) : '0.00', jobName.get(b.job_id) ?? ''])
      })
    }
  } else if (kind === 'invoices') {
    if (!can(ctx, 'invoices')) return new NextResponse('Forbidden', { status: 403 })
    const { data } = await supabase.from('client_invoices').select('id,number,title,invoice_date,due_date,tax_rate,tax_label,holdback_pct,job_id,client_invoice_lines(title,amount,taxable)')
      .eq('org_id', org).in('status', ['released', 'paid']).is('deleted_at', null).gte('invoice_date', from).lte('invoice_date', to).order('invoice_date')
    const jobIds = [...new Set((data ?? []).map((i) => i.job_id))]
    const { data: clients } = jobIds.length ? await supabase.from('job_clients').select('job_id,first_name,last_name').in('job_id', jobIds) : { data: [] }
    const customer = (job: string) => (clients ?? []).filter((c) => c.job_id === job).map((c) => `${c.first_name} ${c.last_name}`.trim()).join(' & ') || jobName.get(job) || 'Client'
    rows = [['InvoiceNo', 'Customer', 'InvoiceDate', 'DueDate', 'Memo', 'Item(Product/Service)', 'ItemDescription', 'ItemQuantity', 'ItemRate', 'ItemAmount', 'ItemTaxCode', 'ItemTaxAmount', 'Job']]
    for (const i of data ?? []) {
      const prefix = (jobName.get(i.job_id) ?? 'JOB').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()
      for (const l of i.client_invoice_lines ?? []) {
        const amt = Number(l.amount)
        rows.push([`${prefix}-${i.number}`, customer(i.job_id), i.invoice_date, i.due_date ?? i.invoice_date, [i.title, Number(i.holdback_pct) ? `Owner holdback ${Number(i.holdback_pct)}%` : ''].filter(Boolean).join(' — '),
          settings?.income_item ?? 'Construction services', l.title, 1, amt.toFixed(2), amt.toFixed(2), l.taxable ? i.tax_label : 'Exempt', l.taxable ? (Math.round(amt * Number(i.tax_rate)) / 100).toFixed(2) : '0.00', jobName.get(i.job_id) ?? ''])
      }
    }
  } else if (kind === 'payments') {
    const [inv, bills] = await Promise.all([
      can(ctx, 'invoices') ? supabase.from('client_payments').select('paid_on,amount,method,reference,client_invoices!inner(number,title,job_id,org_id)').eq('client_invoices.org_id', org).gte('paid_on', from).lte('paid_on', to) : Promise.resolve({ data: [] }),
      can(ctx, 'bills', 'cost') ? supabase.from('bills').select('paid_at,paid_amount,payment_method,payment_ref,invoice_ref,number,job_id,vendor_name,sub:organizations!bills_sub_org_id_fkey(name)').eq('org_id', org).eq('status', 'paid').gte('paid_at', from).lte('paid_at', to) : Promise.resolve({ data: [] }),
    ])
    rows = [['Date', 'Type', 'Party', 'Document', 'Job', 'Method', 'Reference', 'Amount']]
    for (const p of (inv.data ?? []) as { paid_on: string; amount: number; method: string; reference: string | null; client_invoices: { number: number; title: string; job_id: string } }[])
      rows.push([p.paid_on, 'Customer payment', '', `Invoice #${p.client_invoices.number}`, jobName.get(p.client_invoices.job_id) ?? '', p.method, p.reference, Number(p.amount).toFixed(2)])
    for (const b of (bills.data ?? []) as { paid_at: string; paid_amount: number; payment_method: string | null; payment_ref: string | null; invoice_ref: string | null; number: number; job_id: string; vendor_name: string | null; sub: { name: string } | null }[])
      rows.push([b.paid_at, 'Bill payment', b.sub?.name ?? b.vendor_name, b.invoice_ref || `Bill #${b.number}`, jobName.get(b.job_id) ?? '', b.payment_method, b.payment_ref, (-Number(b.paid_amount)).toFixed(2)])
    rows = [rows[0], ...rows.slice(1).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]
  } else return new NextResponse('Unknown export', { status: 400 })

  return new NextResponse(toCsv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="mybuilder-${kind}-${from}-to-${to}.csv"` } })
}
