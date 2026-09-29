'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'

const uuid = z.string().uuid()
const billSchema = z.object({
  job_id: uuid, po_id: uuid.nullable(), sub_org_id: uuid.nullable(), vendor_name: z.string().trim().max(200),
  invoice_ref: z.string().trim().max(60), title: z.string().trim().min(1, 'Enter a title').max(200),
  invoice_date: z.string().date(), due_date: z.union([z.literal(''), z.string().date()]), tax_amount: z.number().min(0).max(1e10),
  holdback_pct: z.number().min(0).max(100), lien_waiver_required: z.boolean(),
})
const itemSchema = z.object({
  po_item_id: uuid.nullable(), cost_code_id: uuid.nullable(), cost_type: z.enum(['labor', 'material', 'equipment', 'subcontractor', 'other', 'none']).nullable(),
  title: z.string().trim().max(200), amount: z.number().finite().min(-1e10).max(1e10), sort: z.number().int(),
})

export async function createBill(bill: unknown, items: unknown): Promise<{ id?: string; error?: string }> {
  await getAppContext()
  const b = billSchema.safeParse(bill)
  if (!b.success) return { error: b.error.issues[0].message }
  const i = z.array(itemSchema).min(1).max(1000).safeParse(items)
  if (!i.success) return { error: i.error.issues[0].message }
  if (!b.data.po_id && !b.data.sub_org_id && !b.data.vendor_name) return { error: 'Pick a sub or enter a vendor name.' }
  if (i.data.some((x) => !x.po_item_id && !x.title && x.amount !== 0)) return { error: 'Every line needs a description.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_bill', { p_bill: { ...b.data, due_date: b.data.due_date || null }, p_items: i.data })
  if (error || !data) return { error: error?.code === '23514' || error?.code === '22023' ? error.message : 'Could not save the bill.' }
  revalidatePath('/bills'); if (b.data.po_id) revalidatePath(`/purchase-orders/${b.data.po_id}`)
  return { id: data }
}

export async function billStatus(id: string, action: 'approve' | 'reject' | 'unapprove' | 'lien_waiver', fd?: FormData) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_bill_status', { p_bill: uuid.parse(id), p_action: action, p_reason: fd ? String(fd.get('reason') ?? '') || undefined : undefined })
  if (error) throw new Error(error.message)
  revalidatePath(`/bills/${id}`); revalidatePath('/bills')
}

export async function payBill(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const p = z.object({ paid_on: z.string().date('Pick the payment date'), method: z.enum(['eft', 'cheque', 'credit_card', 'cash', 'other']), ref: z.string().trim().max(80) })
    .safeParse({ paid_on: fd.get('paid_on'), method: fd.get('method'), ref: fd.get('ref') ?? '' })
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc('pay_bill', { p_bill: uuid.parse(id), p_paid_on: p.data.paid_on, p_method: p.data.method, p_ref: p.data.ref || undefined })
  if (error) return { error: error.code === '22023' ? error.message : 'Could not record the payment.' }
  revalidatePath(`/bills/${id}`); revalidatePath('/bills')
  return { ok: 'Payment recorded.' }
}

export async function deleteBill(id: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('bills').update({ deleted_at: new Date().toISOString() }).eq('id', uuid.parse(id))
  revalidatePath('/bills')
}
