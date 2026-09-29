'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, requireBuilder } from '@/lib/context'
import { cascade, createsCycle, endFor, nextWorkday, type Item, type Link } from '@/lib/schedule/calendar'
import { fetchCalendar } from '@/lib/schedule/data'
import type { ActionState } from '@/components/kit/action-form'

export type ItemFormState = { error?: string; fieldErrors?: Record<string, string> }

const blank = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

const itemSchema = z.object({
  job_id: z.string().uuid('Pick a job'),
  title: z.string().trim().min(1, 'Enter a title').max(120),
  start_date: z.string().date('Pick a start date'),
  duration: z.coerce.number().int().min(1, 'At least 1 workday').max(2000),
  phase: z.string().max(80).nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  progress: z.coerce.number().int().min(0).max(100),
  is_hourly: z.boolean(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  show_on_gantt: z.boolean(), show_subs: z.boolean(), show_client: z.boolean(),
  notes_all: z.string().max(4000).nullable(), notes_internal: z.string().max(4000).nullable(),
  notes_sub: z.string().max(4000).nullable(), notes_client: z.string().max(4000).nullable(),
  reminder_days: z.coerce.number().int().min(0).max(60).nullable(),
  assignees: z.array(z.string().regex(/^[us]:[0-9a-f-]{36}$/)),
  reason: z.string().max(200).nullable(),
})

function parse(fd: FormData) {
  const b = (k: string) => fd.get(k) === 'on'
  return itemSchema.safeParse({
    job_id: fd.get('job_id'), title: fd.get('title'), start_date: fd.get('start_date'), duration: fd.get('duration') ?? 1,
    phase: blank(fd.get('phase')), color: blank(fd.get('color')), progress: fd.get('progress') ?? 0,
    is_hourly: b('is_hourly'), start_time: blank(fd.get('start_time')), end_time: blank(fd.get('end_time')),
    show_on_gantt: fd.has('show_on_gantt') ? b('show_on_gantt') : true, show_subs: b('show_subs'), show_client: b('show_client'),
    notes_all: blank(fd.get('notes_all')), notes_internal: blank(fd.get('notes_internal')),
    notes_sub: blank(fd.get('notes_sub')), notes_client: blank(fd.get('notes_client')),
    reminder_days: blank(fd.get('reminder_days')), assignees: fd.getAll('assignees'), reason: blank(fd.get('reason')),
  })
}

function fieldErrors(e: z.ZodError) {
  const fe: Record<string, string> = {}
  for (const i of e.issues) fe[String(i.path[0])] ??= i.message
  return { error: 'Check the highlighted fields.', fieldErrors: fe }
}

async function phaseId(orgId: string, jobId: string, name: string | null) {
  if (!name) return null
  const supabase = await createClient()
  const { data } = await supabase.from('schedule_phases').upsert({ org_id: orgId, job_id: jobId, name }, { onConflict: 'job_id,name' }).select('id').single()
  return data?.id ?? null
}

async function syncAssignees(itemId: string, wanted: string[]) {
  const supabase = await createClient()
  const { data: cur } = await supabase.from('schedule_assignees').select('id,user_id,sub_org_id').eq('item_id', itemId)
  const key = (a: { user_id: string | null; sub_org_id: string | null }) => (a.user_id ? `u:${a.user_id}` : `s:${a.sub_org_id}`)
  const have = new Map((cur ?? []).map((a) => [key(a), a.id]))
  const add = wanted.filter((w) => !have.has(w))
  const remove = [...have].filter(([k]) => !wanted.includes(k)).map(([, id]) => id)
  if (add.length) await supabase.from('schedule_assignees').insert(add.map((a) => a.startsWith('u:') ? { item_id: itemId, user_id: a.slice(2) } : { item_id: itemId, sub_org_id: a.slice(2) }))
  if (remove.length) await supabase.from('schedule_assignees').delete().in('id', remove)
}

/** Move successors after an item's dates changed. */
async function cascadeFrom(jobId: string, itemIds: string[], reason: string | null) {
  const supabase = await createClient()
  const cal = await fetchCalendar(jobId)
  const { data: items } = await supabase.from('schedule_items').select('id,start_date,duration,end_date').eq('job_id', jobId).is('deleted_at', null)
  const ids = new Set((items ?? []).map((i) => i.id))
  const { data: links } = ids.size ? await supabase.from('schedule_links').select('predecessor_id,successor_id,type,lag_days').in('successor_id', [...ids]) : { data: [] }
  const jobLinks = ((links ?? []) as Link[]).filter((l) => ids.has(l.predecessor_id) && ids.has(l.successor_id))
  const moved = cascade((items ?? []) as Item[], jobLinks, cal, itemIds)
  if (moved.length) {
    const { error } = await supabase.rpc('apply_schedule_changes', {
      p_changes: moved.map((m) => ({ id: m.id, start_date: m.start_date, end_date: m.end_date })),
      p_reason: reason ?? 'Moved by a predecessor', p_cascaded_ids: moved.map((m) => m.id),
    })
    if (error) throw new Error('Could not move dependent items')
  }
  return moved.length
}

export async function createItem(_: ItemFormState, fd: FormData): Promise<ItemFormState> {
  const ctx = await requireBuilder('schedule', 'add')
  const parsed = parse(fd)
  if (!parsed.success) return fieldErrors(parsed.error)
  const d = parsed.data
  const cal = await fetchCalendar(d.job_id)
  const start = nextWorkday(d.start_date, cal)
  const supabase = await createClient()
  const { data, error } = await supabase.from('schedule_items').insert({
    org_id: ctx.workspace.orgId, job_id: d.job_id, phase_id: await phaseId(ctx.workspace.orgId, d.job_id, d.phase),
    title: d.title, color: d.color, start_date: start, duration: d.duration, end_date: endFor(start, d.duration, cal),
    progress: d.progress, is_hourly: d.is_hourly, start_time: d.is_hourly ? d.start_time : null, end_time: d.is_hourly ? d.end_time : null,
    show_on_gantt: d.show_on_gantt, show_subs: d.show_subs, show_client: d.show_client,
    notes_all: d.notes_all, notes_internal: d.notes_internal, notes_sub: d.notes_sub, notes_client: d.notes_client,
    reminder_days: d.reminder_days, created_by: ctx.userId,
  }).select('id').single()
  if (error || !data) return { error: 'Could not create the schedule item.' }
  await syncAssignees(data.id, d.assignees)
  revalidatePath('/schedule')
  redirect(`/schedule/${data.id}`)
}

export async function updateItem(id: string, _: ItemFormState, fd: FormData): Promise<ItemFormState> {
  const ctx = await requireBuilder('schedule', 'edit')
  const parsed = parse(fd)
  if (!parsed.success) return fieldErrors(parsed.error)
  const d = parsed.data
  const supabase = await createClient()
  const { data: before } = await supabase.from('schedule_items').select('job_id,start_date,duration,end_date').eq('id', id).single()
  if (!before) return { error: 'Item not found.' }
  const cal = await fetchCalendar(before.job_id)
  const start = nextWorkday(d.start_date, cal)
  const end = endFor(start, d.duration, cal)
  const datesChanged = start !== before.start_date || end !== before.end_date
  if (datesChanged) {
    const { error } = await supabase.rpc('apply_schedule_changes', { p_changes: [{ id, start_date: start, end_date: end, duration: d.duration }], p_reason: d.reason ?? undefined })
    if (error) return { error: 'Could not move the item.' }
  }
  const { error } = await supabase.from('schedule_items').update({
    phase_id: await phaseId(ctx.workspace.orgId, before.job_id, d.phase), title: d.title, color: d.color, duration: d.duration,
    progress: d.progress, is_hourly: d.is_hourly, start_time: d.is_hourly ? d.start_time : null, end_time: d.is_hourly ? d.end_time : null,
    show_on_gantt: d.show_on_gantt, show_subs: d.show_subs, show_client: d.show_client,
    notes_all: d.notes_all, notes_internal: d.notes_internal, notes_sub: d.notes_sub, notes_client: d.notes_client, reminder_days: d.reminder_days,
  }).eq('id', id)
  if (error) return { error: 'Could not save the item.' }
  await syncAssignees(id, d.assignees)
  if (datesChanged) await cascadeFrom(before.job_id, [id], d.reason)
  revalidatePath('/schedule'); revalidatePath(`/schedule/${id}`)
  redirect(`/schedule/${id}`)
}

export async function deleteItem(id: string) {
  await requireBuilder('schedule', 'delete')
  const supabase = await createClient()
  await supabase.from('schedule_items').update({ deleted_at: new Date().toISOString() }).eq('id', z.string().uuid().parse(id))
  revalidatePath('/schedule')
  redirect('/schedule')
}

export async function setComplete(id: string, done: boolean) {
  await requireBuilder('schedule', 'edit')
  const supabase = await createClient()
  await supabase.from('schedule_items').update({ completed_at: done ? new Date().toISOString() : null, progress: done ? 100 : 0 }).eq('id', id)
  revalidatePath('/schedule'); revalidatePath(`/schedule/${id}`)
}

export async function addLink(successorId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireBuilder('schedule', 'edit')
  const parsed = z.object({ predecessor_id: z.string().uuid('Pick an item'), type: z.enum(['FS', 'SS']), lag_days: z.coerce.number().int().min(-365).max(365) })
    .safeParse({ predecessor_id: fd.get('predecessor_id'), type: fd.get('type'), lag_days: fd.get('lag_days') || 0 })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { data: item } = await supabase.from('schedule_items').select('job_id').eq('id', successorId).single()
  const { data: siblings } = await supabase.from('schedule_items').select('id').eq('job_id', item!.job_id)
  const ids = (siblings ?? []).map((s) => s.id)
  const { data: links } = await supabase.from('schedule_links').select('predecessor_id,successor_id,type,lag_days').in('successor_id', ids)
  const link: Link = { ...parsed.data, successor_id: successorId }
  if (createsCycle((links ?? []) as Link[], link)) return { error: 'That link would create a loop.' }
  const { error } = await supabase.from('schedule_links').insert(link)
  if (error) return { error: /duplicate|primary/i.test(error.message) ? 'Those items are already linked.' : 'Could not add the link.' }
  const moved = await cascadeFrom(item!.job_id, [parsed.data.predecessor_id], 'New predecessor')
  revalidatePath('/schedule'); revalidatePath(`/schedule/${successorId}`)
  return { ok: moved ? `Linked. ${moved} item${moved === 1 ? '' : 's'} moved.` : 'Linked.' }
}

export async function removeLink(predecessorId: string, successorId: string) {
  await requireBuilder('schedule', 'edit')
  const supabase = await createClient()
  await supabase.from('schedule_links').delete().eq('predecessor_id', predecessorId).eq('successor_id', successorId)
  revalidatePath(`/schedule/${successorId}`)
}

export async function setOnline(jobId: string, online: boolean) {
  const ctx = await requireBuilder('schedule', 'edit')
  const supabase = await createClient()
  const { error } = await supabase.from('job_schedule_settings').upsert({ job_id: jobId, org_id: ctx.workspace.orgId, is_online: online, online_at: online ? new Date().toISOString() : null })
  if (error) throw new Error('Could not change the schedule status')
  revalidatePath('/schedule')
}

export async function captureBaseline(jobId: string) {
  const ctx = await requireBuilder('schedule', 'edit')
  const supabase = await createClient()
  const { data: items } = await supabase.from('schedule_items').select('id,title,start_date,end_date,duration').eq('job_id', jobId).is('deleted_at', null)
  await supabase.from('schedule_baselines').insert({ job_id: jobId, captured_by: ctx.userId, items: items ?? [] })
  revalidatePath('/schedule')
}

export async function respond(itemId: string, confirm: boolean) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('respond_schedule_item', { p_item: itemId, p_confirm: confirm })
  if (error) throw new Error(error.message)
  revalidatePath('/schedule'); revalidatePath(`/schedule/${itemId}`)
}

// ----- workday exceptions ------------------------------------------------------

export async function addException(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireBuilder('schedule', 'edit')
  const parsed = z.object({
    title: z.string().trim().min(1, 'Name it').max(80),
    type: z.enum(['non_workday', 'extra_workday']),
    category: z.string().max(60).nullable(),
    start_date: z.string().date('Pick a start date'),
    end_date: z.string().date('Pick an end date'),
    repeat_annually: z.boolean(),
    job_id: z.string().uuid().nullable(),
  }).refine((d) => d.end_date >= d.start_date, { message: 'End date must be on or after the start date' })
    .safeParse({
      title: fd.get('title'), type: fd.get('type'), category: blank(fd.get('category')), start_date: fd.get('start_date'),
      end_date: fd.get('end_date') || fd.get('start_date'), repeat_annually: fd.get('repeat_annually') === 'on', job_id: blank(fd.get('job_id')),
    })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('workday_exceptions').insert({ org_id: ctx.workspace.orgId, ...parsed.data })
  if (error) return { error: 'Could not add the exception.' }
  revalidatePath('/schedule')
  return { ok: `${parsed.data.title} added. Existing items keep their dates until they are edited.` }
}

export async function deleteException(id: string) {
  await requireBuilder('schedule', 'edit')
  const supabase = await createClient()
  await supabase.from('workday_exceptions').delete().eq('id', z.string().uuid().parse(id))
  revalidatePath('/schedule')
}
