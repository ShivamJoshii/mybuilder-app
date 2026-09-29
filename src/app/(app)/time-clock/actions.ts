'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import { zonedToUtc } from '@/lib/utils'
import type { ActionState } from '@/components/kit/action-form'

const uuid = z.string().uuid()
const coord = z.number().min(-180).max(180).nullable()

export async function clockIn(input: { job: string; costCode: string | null; lat: number | null; lng: number | null }) {
  await getAppContext()
  const d = z.object({ job: uuid, costCode: uuid.nullable(), lat: coord, lng: coord }).safeParse(input)
  if (!d.success) return { error: 'Pick a job.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('clock_in', { p_job: d.data.job, p_cost_code: d.data.costCode ?? undefined, p_lat: d.data.lat ?? undefined, p_lng: d.data.lng ?? undefined })
  if (error) return { error: error.code === '23505' ? error.message : error.code === '42501' ? 'You can’t clock in to that job.' : 'Could not clock in.' }
  revalidatePath('/time-clock')
  return { ok: true }
}

export async function clockOut(input: { breakMinutes: number; notes: string; lat: number | null; lng: number | null }) {
  await getAppContext()
  const d = z.object({ breakMinutes: z.number().int().min(0).max(720), notes: z.string().max(2000), lat: coord, lng: coord }).safeParse(input)
  if (!d.success) return { error: 'Check the break minutes.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('clock_out', { p_break: d.data.breakMinutes, p_notes: d.data.notes || undefined, p_lat: d.data.lat ?? undefined, p_lng: d.data.lng ?? undefined })
  if (error) return { error: error.message }
  revalidatePath('/time-clock')
  return { ok: true }
}

export async function addShift(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const p = z.object({
    job: uuid, cost_code: z.union([z.literal(''), uuid]), date: z.string().date('Pick a date'),
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Start time'), end: z.string().regex(/^\d{2}:\d{2}$/, 'End time'),
    break_minutes: z.coerce.number().int().min(0).max(720), notes: z.string().max(2000),
  }).safeParse({ job: fd.get('job'), cost_code: fd.get('cost_code') ?? '', date: fd.get('date'), start: fd.get('start'), end: fd.get('end'), break_minutes: fd.get('break_minutes') || 0, notes: fd.get('notes') ?? '' })
  if (!p.success) return { error: p.error.issues[0].message }
  const job = ctx.jobs.find((j) => j.id === p.data.job)
  if (!job) return { error: 'Pick a job.' }
  const clock_in = zonedToUtc(`${p.data.date}T${p.data.start}`)
  let clock_out = zonedToUtc(`${p.data.date}T${p.data.end}`)
  if (clock_out <= clock_in) clock_out = new Date(Date.parse(clock_out) + 86_400_000).toISOString()   // overnight
  const supabase = await createClient()
  const { error } = await supabase.from('time_shifts').insert({
    org_id: job.org_id, job_id: job.id, user_id: ctx.userId, cost_code_id: p.data.cost_code || null, clock_in, clock_out,
    break_minutes: p.data.break_minutes, notes: p.data.notes || null, status: 'submitted',
  })
  if (error) return { error: 'Could not add the shift. Shifts can be up to 24 hours.' }
  revalidatePath('/time-clock')
  return { ok: 'Shift added and submitted for approval.' }
}

export async function reviewShifts(approve: boolean, fd: FormData) {
  await getAppContext()
  const ids = z.array(uuid).max(1000).parse(fd.getAll('shift'))
  if (!ids.length) return
  const supabase = await createClient()
  await supabase.rpc('review_shifts', { p_ids: ids, p_approve: approve })
  revalidatePath('/time-clock')
}

export async function deleteShift(id: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('time_shifts').delete().eq('id', uuid.parse(id))
  revalidatePath('/time-clock')
}

export async function saveRates(fd: FormData) {
  const ctx = await getAppContext()
  if (ctx.workspace.mode !== 'builder') return
  const rows: { org_id: string; user_id: string; hourly_cost: number }[] = []
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith('rate:') || v === '') continue
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0 && n < 10000) rows.push({ org_id: ctx.workspace.orgId, user_id: uuid.parse(k.slice(5)), hourly_cost: n })
  }
  const supabase = await createClient()
  if (rows.length) await supabase.from('labor_rates').upsert(rows)
  revalidatePath('/time-clock')
}
