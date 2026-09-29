'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import { parseDecision } from '@/lib/signature'
import type { ActionState } from '@/components/kit/action-form'
import type { SaveResult } from '@/components/kit/cost-worksheet'

const uuid = z.string().uuid()
const num = z.coerce.number().finite()

const createSchema = z.object({
  job_id: uuid,
  title: z.string().trim().min(1, 'Enter a title').max(200),
  description: z.string().trim().max(8000),
  internal_notes: z.string().trim().max(8000),
})

export async function createChangeOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const parsed = createSchema.safeParse({ job_id: fd.get('job_id'), title: fd.get('title'), description: fd.get('description') ?? '', internal_notes: fd.get('internal_notes') ?? '' })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const job = ctx.jobs.find((j) => j.id === d.job_id)
  if (!job) return { error: 'Pick a job you have access to.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('change_orders').insert({
    org_id: job.org_id, job_id: job.id, number: 0, title: d.title, description: d.description || null,
  }).select('id').single()
  if (error || !data) return { error: ctx.workspace.mode === 'client' ? 'Your builder has not turned on change requests for this job.' : 'Could not create the change order.' }
  if (ctx.workspace.mode === 'builder' && d.internal_notes) await supabase.from('change_order_private').update({ internal_notes: d.internal_notes }).eq('change_order_id', data.id)
  revalidatePath('/change-orders')
  redirect(`/change-orders/${data.id}`)
}

const detailsSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200),
  description: z.string().max(8000), internal_notes: z.string().max(8000),
  approval_deadline: z.union([z.literal(''), z.string().date()]), collect_signature: z.boolean(),
})

export async function updateChangeOrder(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const parsed = detailsSchema.safeParse({
    title: fd.get('title'), description: fd.get('description') ?? '', internal_notes: fd.get('internal_notes') ?? '',
    approval_deadline: fd.get('approval_deadline') ?? '', collect_signature: fd.get('collect_signature') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('change_orders').update({
    title: d.title, description: d.description || null, approval_deadline: d.approval_deadline || null, collect_signature: d.collect_signature,
  }).eq('id', uuid.parse(id)).select('id')
  if (error || !data?.length) return { error: 'Could not save. Only drafts can be changed.' }
  await supabase.from('change_order_private').update({ internal_notes: d.internal_notes || null }).eq('change_order_id', id)
  revalidatePath(`/change-orders/${id}`)
  return { ok: 'Details saved.' }
}

const lineSchema = z.object({
  id: uuid, cost_code_id: uuid.nullable(), cost_type: z.enum(['labor', 'material', 'equipment', 'subcontractor', 'other', 'none']),
  title: z.string().trim().min(1, 'Every line needs a title').max(200), description: z.string().max(4000).nullable(), internal_notes: z.string().max(4000).nullable(),
  quantity: num.min(-1e9).max(1e9), unit: z.string().trim().max(20), unit_cost: num.min(-1e10).max(1e10),
  markup_type: z.enum(['percent', 'amount']), markup_value: num.min(-1e10).max(1e10), taxable: z.boolean(), sort: z.number().int(),
})
const saveSchema = z.object({
  settings: z.object({ default_markup_pct: num.min(0).max(1000), tax_rate: num.min(0).max(100), tax_label: z.string().trim().min(1).max(30) }),
  items: z.array(lineSchema).max(2000),
})

export async function saveChangeOrderLines(id: string, payload: unknown): Promise<SaveResult> {
  await getAppContext()
  const parsed = saveSchema.safeParse(payload)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc('save_change_order', { p_co: uuid.parse(id), p_settings: parsed.data.settings, p_items: parsed.data.items })
  if (error) return { error: error.code === '55000' ? error.message : 'Could not save. Check your permissions and try again.' }
  revalidatePath(`/change-orders/${id}`)
  return { ok: true }
}

export async function releaseChangeOrder(id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('release_change_order', { p_co: uuid.parse(id) })
  if (error) throw new Error(error.message)
  revalidatePath(`/change-orders/${id}`); revalidatePath('/change-orders')
}

export async function deleteChangeOrder(id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { data } = await supabase.from('change_orders').delete().eq('id', uuid.parse(id)).select('id')
  if (!data?.length) throw new Error('Could not delete the change order.')
  revalidatePath('/change-orders')
  redirect('/change-orders')
}

export async function decideChangeOrder(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const d = await parseDecision(fd)
  if ('error' in d) return { error: d.error }
  const supabase = await createClient()
  const { error } = await supabase.rpc('decide_change_order', { p_co: uuid.parse(id), ...d.args })
  if (error) return { error: error.code === '23514' ? 'Add your signature to approve.' : error.code === '22023' ? error.message : 'Could not record the decision.' }
  revalidatePath(`/change-orders/${id}`); revalidatePath('/change-orders')
  return { ok: d.decision === 'approved' ? 'Approved. Thank you!' : 'Declined.' }
}
