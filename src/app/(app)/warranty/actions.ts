'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import { zonedToUtc } from '@/lib/utils'
import type { ActionState } from '@/components/kit/action-form'

const uuid = z.string().uuid()
const who = z.union([z.literal(''), z.string().regex(/^(u|s):[0-9a-f-]{36}$/)])
const split = (v: string) => ({ user: v.startsWith('u:') ? v.slice(2) : null, sub: v.startsWith('s:') ? v.slice(2) : null })

export async function createClaim(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const job = ctx.jobs.find((j) => j.id === fd.get('job_id'))
  if (!job) return { error: 'Pick a job.' }
  const p = z.object({
    title: z.string().trim().min(1, 'Describe the issue in a few words').max(200), description: z.string().trim().max(8000),
    category: z.string().trim().max(60), location: z.string().trim().max(80), priority: z.enum(['low', 'normal', 'urgent']), assignee: who,
  }).safeParse({ title: fd.get('title'), description: fd.get('description') ?? '', category: fd.get('category') ?? '', location: fd.get('location') ?? '',
    priority: fd.get('priority') ?? 'normal', assignee: fd.get('assignee') ?? '' })
  if (!p.success) return { error: p.error.issues[0].message }
  const a = split(p.data.assignee)
  const supabase = await createClient()
  const { data, error } = await supabase.from('warranty_claims').insert({
    org_id: job.org_id, job_id: job.id, number: 0, title: p.data.title, description: p.data.description || null, category: p.data.category || null,
    location: p.data.location || null, priority: p.data.priority, assignee_user_id: a.user, assignee_sub_org_id: a.sub,
  }).select('id').single()
  if (error || !data) return { error: ctx.workspace.mode === 'client' ? 'Warranty requests are turned off for this job. Contact your builder.' : 'Could not create the claim.' }
  revalidatePath('/warranty')
  redirect(`/warranty/${data.id}`)
}

export async function updateClaim(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const p = z.object({
    title: z.string().trim().min(1).max(200), description: z.string().max(8000), category: z.string().trim().max(60), location: z.string().trim().max(80),
    priority: z.enum(['low', 'normal', 'urgent']), status: z.enum(['open', 'scheduled', 'resolved', 'closed']), assignee: who, internal_notes: z.string().max(8000),
  }).safeParse({ title: fd.get('title'), description: fd.get('description') ?? '', category: fd.get('category') ?? '', location: fd.get('location') ?? '',
    priority: fd.get('priority'), status: fd.get('status'), assignee: fd.get('assignee') ?? '', internal_notes: fd.get('internal_notes') ?? '' })
  if (!p.success) return { error: p.error.issues[0].message }
  const a = split(p.data.assignee)
  const supabase = await createClient()
  const { data } = await supabase.from('warranty_claims').update({
    title: p.data.title, description: p.data.description || null, category: p.data.category || null, location: p.data.location || null,
    priority: p.data.priority, status: p.data.status, assignee_user_id: a.user, assignee_sub_org_id: a.sub,
  }).eq('id', uuid.parse(id)).select('id')
  if (!data?.length) return { error: 'Could not save the claim.' }
  await supabase.from('warranty_claim_notes').upsert({ claim_id: id, internal_notes: p.data.internal_notes })
  revalidatePath(`/warranty/${id}`); revalidatePath('/warranty')
  return { ok: 'Claim saved.' }
}

export async function addAppointment(claimId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const p = z.object({ starts: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Pick a date and time'), hours: z.coerce.number().min(0.25).max(24), assignee: who, notes: z.string().max(4000) })
    .safeParse({ starts: fd.get('starts'), hours: fd.get('hours') || 2, assignee: fd.get('assignee') ?? '', notes: fd.get('notes') ?? '' })
  if (!p.success) return { error: p.error.issues[0].message }
  const a = split(p.data.assignee)
  const starts = zonedToUtc(p.data.starts, ctx.tz)
  const ends = new Date(Date.parse(starts) + p.data.hours * 3_600_000).toISOString()
  const supabase = await createClient()
  const { error } = await supabase.from('warranty_appointments').insert({ claim_id: uuid.parse(claimId), starts_at: starts, ends_at: ends, assignee_user_id: a.user, assignee_sub_org_id: a.sub, notes: p.data.notes || null })
  if (error) return { error: 'Could not book the appointment.' }
  revalidatePath(`/warranty/${claimId}`)
  return { ok: 'Appointment booked. Everyone involved is notified.' }
}

export async function updateAppointment(claimId: string, apptId: string, status: 'confirmed' | 'completed' | 'missed' | 'cancelled', fd?: FormData) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_appointment', { p_appt: uuid.parse(apptId), p_status: status, p_work_notes: fd ? String(fd.get('work_notes') ?? '') || undefined : undefined })
  if (error) throw new Error(error.message)
  revalidatePath(`/warranty/${claimId}`)
}

export async function leaveFeedback(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const p = z.object({ rating: z.coerce.number().int().min(1, 'Pick a rating').max(5), feedback: z.string().trim().max(4000) }).safeParse({ rating: fd.get('rating'), feedback: fd.get('feedback') ?? '' })
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc('claim_feedback', { p_claim: uuid.parse(id), p_rating: p.data.rating, p_feedback: p.data.feedback })
  if (error) return { error: error.code === '22023' ? error.message : 'Could not save your feedback.' }
  revalidatePath(`/warranty/${id}`)
  return { ok: 'Thanks for the feedback!' }
}
