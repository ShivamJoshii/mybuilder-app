'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'
import type { Line } from '@/components/kit/lines-editor'
import { lineSchema } from '@/lib/lines'

const uuid = z.string().uuid()
const poSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200), scope: z.string().max(20000),
  payee: z.string().regex(/^(s:[0-9a-f-]{36}|vendor)$/, 'Pick who the PO is for'), vendor_name: z.string().trim().max(200),
  holdback_pct: z.coerce.number().min(0).max(100), lien_waiver_required: z.boolean(),
})
const parse = (fd: FormData) => poSchema.safeParse({
  title: fd.get('title'), scope: fd.get('scope') ?? '', payee: fd.get('payee'), vendor_name: fd.get('vendor_name') ?? '',
  holdback_pct: fd.get('holdback_pct') ?? 10, lien_waiver_required: fd.get('lien_waiver_required') === 'on',
})
function row(d: z.infer<typeof poSchema>) {
  if (d.payee === 'vendor' && !d.vendor_name) throw new Error('Enter the vendor name')
  return {
    title: d.title, scope: d.scope || null, sub_org_id: d.payee === 'vendor' ? null : d.payee.slice(2), vendor_name: d.payee === 'vendor' ? d.vendor_name : null,
    holdback_pct: d.holdback_pct, lien_waiver_required: d.lien_waiver_required,
  }
}

export async function createPo(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const job = ctx.jobs.find((j) => j.id === fd.get('job_id'))
  if (!job) return { error: 'Pick a job.' }
  const p = parse(fd)
  if (!p.success) return { error: p.error.issues[0].message }
  let r; try { r = row(p.data) } catch (e) { return { error: (e as Error).message } }
  const supabase = await createClient()
  const { data, error } = await supabase.from('purchase_orders').insert({ org_id: job.org_id, job_id: job.id, number: 0, ...r }).select('id').single()
  if (error || !data) return { error: 'Could not create the purchase order.' }
  revalidatePath('/purchase-orders')
  redirect(`/purchase-orders/${data.id}`)
}

export async function updatePo(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const p = parse(fd)
  if (!p.success) return { error: p.error.issues[0].message }
  let r; try { r = row(p.data) } catch (e) { return { error: (e as Error).message } }
  const supabase = await createClient()
  const { data } = await supabase.from('purchase_orders').update(r).eq('id', uuid.parse(id)).select('id')
  if (!data?.length) return { error: 'Could not save. Only drafts can be changed.' }
  revalidatePath(`/purchase-orders/${id}`)
  return { ok: 'Saved.' }
}

export async function savePoLines(id: string, lines: Line[]) {
  await getAppContext()
  const parsed = z.array(lineSchema).max(1000).safeParse(lines)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc('save_po_items', { p_po: uuid.parse(id), p_items: parsed.data })
  if (error) return { error: error.code === '55000' ? error.message : 'Could not save the lines.' }
  revalidatePath(`/purchase-orders/${id}`)
  return { ok: true as const }
}

export async function releasePo(id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('release_po', { p_po: uuid.parse(id) })
  if (error) throw new Error(error.message)
  revalidatePath(`/purchase-orders/${id}`); revalidatePath('/purchase-orders')
}

export async function decidePo(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const decision = fd.get('decision') === 'approved' ? 'accepted' : 'declined'
  const name = z.string().trim().min(1, 'Enter your full name').max(120).safeParse(fd.get('signer_name'))
  if (!name.success) return { error: name.error.issues[0].message }
  if (decision === 'accepted' && fd.get('agree') !== 'on') return { error: 'Confirm that you agree before accepting.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('decide_po', {
    p_po: uuid.parse(id), p_decision: decision, p_signer_name: name.data, p_signature: String(fd.get('signature') ?? ''),
    p_reason: String(fd.get('comment') ?? '') || undefined,
  })
  if (error) return { error: error.code === '23514' ? 'Add your signature to accept.' : error.code === '22023' ? error.message : 'Could not record the decision.' }
  revalidatePath(`/purchase-orders/${id}`); revalidatePath('/purchase-orders')
  return { ok: decision === 'accepted' ? 'Accepted.' : 'Declined.' }
}

export async function setWorkStatus(id: string, fd: FormData) {
  await getAppContext()
  const s = z.enum(['not_started', 'in_progress', 'complete']).parse(fd.get('work_status'))
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_po_work_status', { p_po: uuid.parse(id), p_status: s })
  if (error) throw new Error(error.message)
  revalidatePath(`/purchase-orders/${id}`); revalidatePath('/purchase-orders')
}

export async function releaseHoldback(id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { data: bill, error } = await supabase.rpc('release_holdback', { p_po: uuid.parse(id) })
  if (error || !bill) throw new Error(error?.message ?? 'Could not release holdback')
  revalidatePath(`/purchase-orders/${id}`); revalidatePath('/bills')
  redirect(`/bills/${bill}`)
}
