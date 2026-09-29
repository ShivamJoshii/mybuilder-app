'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'

const uuid = z.string().uuid()
const invSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200), description: z.string().max(8000),
  invoice_date: z.string().date(), due_date: z.union([z.literal(''), z.string().date()]),
  holdback_pct: z.coerce.number().min(0).max(100), tax_rate: z.coerce.number().min(0).max(100), tax_label: z.string().trim().min(1).max(30),
})
const parse = (fd: FormData) => invSchema.safeParse({
  title: fd.get('title'), description: fd.get('description') ?? '', invoice_date: fd.get('invoice_date'), due_date: fd.get('due_date') ?? '',
  holdback_pct: fd.get('holdback_pct') || 0, tax_rate: fd.get('tax_rate') ?? 5, tax_label: fd.get('tax_label') || 'GST',
})

export async function createInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const job = ctx.jobs.find((j) => j.id === fd.get('job_id'))
  if (!job) return { error: 'Pick a job.' }
  const p = parse(fd)
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { tax_rate: _r, tax_label: _l, ...rest } = p.data
  void _r; void _l
  const { data, error } = await supabase.from('client_invoices').insert({ org_id: job.org_id, job_id: job.id, number: 0, ...rest, description: rest.description || null, due_date: rest.due_date || null }).select('id').single()
  if (error || !data) return { error: 'Could not create the invoice.' }
  revalidatePath('/invoices')
  redirect(`/invoices/${data.id}`)
}

export async function updateInvoice(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const p = parse(fd)
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { data } = await supabase.from('client_invoices').update({ ...p.data, description: p.data.description || null, due_date: p.data.due_date || null }).eq('id', uuid.parse(id)).select('id')
  if (!data?.length) return { error: 'Could not save. Only drafts can be changed.' }
  revalidatePath(`/invoices/${id}`)
  return { ok: 'Saved.' }
}

const lineSchema = z.object({
  kind: z.enum(['amount', 'percent', 'change_order']), change_order_id: uuid.nullable(), title: z.string().trim().min(1, 'Every line needs a description').max(200),
  percent: z.number().min(-100).max(100).nullable(), amount: z.number().finite().min(-1e10).max(1e10), taxable: z.boolean(), sort: z.number().int(),
})

export async function saveInvoiceLines(id: string, lines: unknown) {
  await getAppContext()
  const p = z.array(lineSchema).max(500).safeParse(lines)
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc('save_invoice_lines', { p_invoice: uuid.parse(id), p_lines: p.data })
  if (error) return { error: error.code === '55000' ? error.message : 'Could not save the lines.' }
  revalidatePath(`/invoices/${id}`)
  return { ok: true as const }
}

export async function releaseInvoice(id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('release_invoice', { p: uuid.parse(id) })
  if (error) throw new Error(error.message)
  revalidatePath(`/invoices/${id}`); revalidatePath('/invoices')
}

export async function voidInvoice(id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('void_invoice', { p: uuid.parse(id) })
  if (error) throw new Error(error.message)
  revalidatePath(`/invoices/${id}`); revalidatePath('/invoices')
}

export async function recordPayment(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const p = z.object({
    paid_on: z.string().date('Pick the date'), amount: z.coerce.number().finite().refine((n) => n !== 0, 'Enter an amount'),
    method: z.enum(['eft', 'cheque', 'credit_card', 'cash', 'other']), ref: z.string().trim().max(80),
  }).safeParse({ paid_on: fd.get('paid_on'), amount: fd.get('amount'), method: fd.get('method'), ref: fd.get('ref') ?? '' })
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc('record_client_payment', { p: uuid.parse(id), p_paid_on: p.data.paid_on, p_amount: p.data.amount, p_method: p.data.method, p_ref: p.data.ref || undefined })
  if (error) return { error: error.code === '22023' ? error.message : 'Could not record the payment.' }
  revalidatePath(`/invoices/${id}`); revalidatePath('/invoices')
  return { ok: 'Payment recorded.' }
}

export async function removePayment(invoiceId: string, paymentId: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('client_payments').delete().eq('id', uuid.parse(paymentId))
  revalidatePath(`/invoices/${invoiceId}`); revalidatePath('/invoices')
}
