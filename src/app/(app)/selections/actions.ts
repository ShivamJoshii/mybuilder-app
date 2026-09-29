'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'

const uuid = z.string().uuid()
const money = z.union([z.literal(''), z.coerce.number().finite().min(0).max(1e10)])

const selSchema = z.object({
  job_id: uuid,
  title: z.string().trim().min(1, 'Enter a title').max(200),
  category: z.string().trim().max(80), location: z.string().trim().max(80),
  instructions: z.string().trim().max(8000),
  allowance: money,
  deadline_mode: z.enum(['none', 'date', 'schedule']),
  deadline: z.union([z.literal(''), z.string().date()]),
  schedule_item_id: z.union([z.literal(''), uuid]),
  days_before: z.coerce.number().int().min(0).max(365),
  share_client: z.boolean(), share_subs: z.boolean(),
})

function parseSel(fd: FormData) {
  return selSchema.safeParse({
    job_id: fd.get('job_id'), title: fd.get('title'), category: fd.get('category') ?? '', location: fd.get('location') ?? '',
    instructions: fd.get('instructions') ?? '', allowance: fd.get('allowance') ?? '', deadline_mode: fd.get('deadline_mode') ?? 'none',
    deadline: fd.get('deadline') ?? '', schedule_item_id: fd.get('schedule_item_id') ?? '', days_before: fd.get('days_before') || 0,
    share_client: fd.get('share_client') === 'on', share_subs: fd.get('share_subs') === 'on',
  })
}
function toRow(d: z.infer<typeof selSchema>) {
  if (d.deadline_mode === 'date' && !d.deadline) throw new Error('Pick a deadline')
  if (d.deadline_mode === 'schedule' && !d.schedule_item_id) throw new Error('Pick a schedule item')
  return {
    title: d.title, category: d.category || null, location: d.location || null, instructions: d.instructions || null,
    allowance: d.allowance === '' ? null : d.allowance,
    deadline: d.deadline_mode === 'date' ? d.deadline : null,
    schedule_item_id: d.deadline_mode === 'schedule' ? d.schedule_item_id : null,
    days_before: d.deadline_mode === 'schedule' ? d.days_before : null,
    share_client: d.share_client, share_subs: d.share_subs,
  }
}

export async function createSelection(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const parsed = parseSel(fd)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const job = ctx.jobs.find((j) => j.id === parsed.data.job_id)
  if (!job) return { error: 'Pick a job you have access to.' }
  let row
  try { row = toRow(parsed.data) } catch (e) { return { error: (e as Error).message } }
  const supabase = await createClient()
  const { data, error } = await supabase.from('selections').insert({ org_id: job.org_id, job_id: job.id, ...row }).select('id').single()
  if (error || !data) return { error: 'Could not create the selection.' }
  revalidatePath('/selections')
  redirect(`/selections/${data.id}`)
}

export async function updateSelection(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const parsed = parseSel(fd)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  let row
  try { row = toRow(parsed.data) } catch (e) { return { error: (e as Error).message } }
  const supabase = await createClient()
  const { data, error } = await supabase.from('selections').update(row).eq('id', uuid.parse(id)).select('id')
  if (error || !data?.length) return { error: 'Could not save. Approved selections are locked.' }
  revalidatePath(`/selections/${id}`)
  redirect(`/selections/${id}`)
}

export async function deleteSelection(id: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('selections').update({ deleted_at: new Date().toISOString() }).eq('id', uuid.parse(id))
  revalidatePath('/selections')
  redirect('/selections')
}

const choiceSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200), description: z.string().trim().max(4000),
  vendor: z.string().trim().max(120), product_code: z.string().trim().max(80),
  client_price: z.coerce.number().finite().min(-1e10).max(1e10), builder_cost: money,
})

export async function addChoice(selectionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const parsed = choiceSchema.safeParse({
    title: fd.get('title'), description: fd.get('description') ?? '', vendor: fd.get('vendor') ?? '', product_code: fd.get('product_code') ?? '',
    client_price: fd.get('client_price') || 0, builder_cost: fd.get('builder_cost') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { count } = await supabase.from('selection_choices').select('id', { count: 'exact', head: true }).eq('selection_id', selectionId)
  const { data, error } = await supabase.from('selection_choices').insert({
    selection_id: uuid.parse(selectionId), title: d.title, description: d.description || null, vendor: d.vendor || null,
    product_code: d.product_code || null, client_price: d.client_price, sort: (count ?? 0) + 1,
  }).select('id').single()
  if (error || !data) return { error: 'Could not add the choice. Approved selections are locked.' }
  if (d.builder_cost !== '') await supabase.from('selection_choice_costs').insert({ choice_id: data.id, builder_cost: d.builder_cost })
  revalidatePath(`/selections/${selectionId}`)
  return { ok: 'Choice added.' }
}

export async function setChoiceAvailable(selectionId: string, choiceId: string, available: boolean) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('selection_choices').update({ is_available: available }).eq('id', uuid.parse(choiceId))
  revalidatePath(`/selections/${selectionId}`)
}

export async function deleteChoice(selectionId: string, choiceId: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('selection_choices').delete().eq('id', uuid.parse(choiceId))
  revalidatePath(`/selections/${selectionId}`)
}

async function rpc(name: 'release_selection' | 'unlock_selection', id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc(name, { p_sel: uuid.parse(id) })
  if (error) throw new Error(error.message)
  revalidatePath(`/selections/${id}`); revalidatePath('/selections')
}
export async function releaseSelection(id: string) { await rpc('release_selection', id) }
export async function unlockSelection(id: string) { await rpc('unlock_selection', id) }

export async function chooseSelection(id: string, choiceId: string) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('choose_selection', { p_sel: uuid.parse(id), p_choice: uuid.parse(choiceId) })
  if (error) throw new Error(error.message)
  revalidatePath(`/selections/${id}`); revalidatePath('/selections')
}

export async function approveSelection(id: string, fd: FormData) {
  await getAppContext()
  const supabase = await createClient()
  const { data: co, error } = await supabase.rpc('approve_selection', { p_sel: uuid.parse(id), p_create_co: fd.get('create_co') === 'on' })
  if (error) throw new Error(error.message)
  revalidatePath(`/selections/${id}`); revalidatePath('/selections'); revalidatePath('/change-orders')
  if (co) redirect(`/change-orders/${co}`)
}
