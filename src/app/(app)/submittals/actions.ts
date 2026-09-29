'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'

const uuid = z.string().uuid()
const schema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200), spec_section: z.string().trim().max(60),
  kind: z.enum(['shop_drawing', 'product_data', 'sample', 'mock_up', 'other']), description: z.string().max(8000),
  submitter: z.union([z.literal(''), uuid]), reviewer: z.union([z.literal(''), uuid]),
  due_date: z.union([z.literal(''), z.string().date()]), required_on_site: z.union([z.literal(''), z.string().date()]),
})
const parse = (fd: FormData) => schema.safeParse({
  title: fd.get('title'), spec_section: fd.get('spec_section') ?? '', kind: fd.get('kind') ?? 'product_data', description: fd.get('description') ?? '',
  submitter: fd.get('submitter') ?? '', reviewer: fd.get('reviewer') ?? '', due_date: fd.get('due_date') ?? '', required_on_site: fd.get('required_on_site') ?? '',
})
const row = (d: z.infer<typeof schema>) => ({
  title: d.title, spec_section: d.spec_section || null, kind: d.kind, description: d.description || null,
  submitter_sub_org_id: d.submitter || null, reviewer_user_id: d.reviewer || null, due_date: d.due_date || null, required_on_site: d.required_on_site || null,
})

export async function createSubmittal(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const job = ctx.jobs.find((j) => j.id === fd.get('job_id'))
  if (!job) return { error: 'Pick a job.' }
  const p = parse(fd)
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.from('submittals').insert({ org_id: job.org_id, job_id: job.id, number: 0, ...row(p.data) }).select('id').single()
  if (error || !data) return { error: 'Could not create the submittal.' }
  if (fd.get('intent') === 'request' && p.data.submitter) await supabase.rpc('request_submittal', { p: data.id })
  revalidatePath('/submittals')
  redirect(`/submittals/${data.id}`)
}

export async function updateSubmittal(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const p = parse(fd)
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { data } = await supabase.from('submittals').update(row(p.data)).eq('id', uuid.parse(id)).select('id')
  if (!data?.length) return { error: 'Could not save.' }
  revalidatePath(`/submittals/${id}`)
  return { ok: 'Saved.' }
}

export async function requestSubmittal(id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('request_submittal', { p: uuid.parse(id) })
  if (error) throw new Error(error.message)
  revalidatePath(`/submittals/${id}`); revalidatePath('/submittals')
}

export async function submitRevision(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_submittal', { p: uuid.parse(id), p_notes: String(fd.get('notes') ?? '') || undefined })
  if (error) return { error: error.code === '22023' ? error.message : 'Could not submit.' }
  revalidatePath(`/submittals/${id}`); revalidatePath('/submittals')
  return { ok: 'Submitted for review. Attach the files below.' }
}

export async function reviewSubmittal(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const d = z.enum(['approved', 'approved_as_noted', 'revise', 'rejected']).safeParse(fd.get('decision'))
  if (!d.success) return { error: 'Pick a decision.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('review_submittal', { p: uuid.parse(id), p_decision: d.data, p_notes: String(fd.get('notes') ?? '') || undefined })
  if (error) return { error: error.code === '23514' ? 'Add review notes for that decision.' : error.code === '22023' ? error.message : 'Could not save the review.' }
  revalidatePath(`/submittals/${id}`); revalidatePath('/submittals')
  return { ok: 'Review saved.' }
}
