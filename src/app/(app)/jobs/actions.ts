'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireBuilder, can } from '@/lib/context'
import { todayIn } from '@/lib/utils'
import type { ActionState } from '@/components/kit/action-form'
import { parsePortalSettings } from '@/lib/portal-settings'

export type JobFormState = { error?: string; fieldErrors?: Record<string, string> }

const blank = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const postal = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/

const jobSchema = z.object({
  title: z.string().trim().min(1, 'Enter a job name').max(120),
  job_type: z.string().max(60).nullable(),
  contract_type: z.enum(['fixed_price', 'open_book']),
  status: z.enum(['presale', 'open', 'warranty', 'closed']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour'),
  street: z.string().max(200).nullable(),
  city: z.string().max(100).nullable(),
  province: z.string().length(2).nullable(),
  postal_code: z.string().regex(postal, 'Use a Canadian postal code like T5J 0N3')
    .transform((v) => { const c = v.replace(/[ -]/g, '').toUpperCase(); return `${c.slice(0, 3)} ${c.slice(3)}` }).nullable(),
  permit_number: z.string().max(60).nullable(),
  lot_info: z.string().max(200).nullable(),
  square_feet: z.coerce.number().int().min(0).max(1_000_000).nullable(),
  projected_start: z.string().date().nullable(),
  projected_end: z.string().date().nullable(),
  work_days: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'Pick at least one work day'),
  sub_notes: z.string().max(4000).nullable(),
  contract_price: z.coerce.number().min(0).max(1_000_000_000).nullable(),
  internal_notes: z.string().max(4000).nullable(),
  managers: z.array(z.string().uuid()),
}).refine((d) => !d.projected_start || !d.projected_end || d.projected_end >= d.projected_start, {
  path: ['projected_end'], message: 'End date must be on or after the start date',
})

function parse(formData: FormData) {
  return jobSchema.safeParse({
    title: formData.get('title'),
    job_type: blank(formData.get('job_type')),
    contract_type: formData.get('contract_type') ?? 'fixed_price',
    status: formData.get('status') ?? 'open',
    color: formData.get('color') ?? '#4F7CAC',
    street: blank(formData.get('street')),
    city: blank(formData.get('city')),
    province: blank(formData.get('province')),
    postal_code: blank(formData.get('postal_code')),
    permit_number: blank(formData.get('permit_number')),
    lot_info: blank(formData.get('lot_info')),
    square_feet: blank(formData.get('square_feet')),
    projected_start: blank(formData.get('projected_start')),
    projected_end: blank(formData.get('projected_end')),
    work_days: formData.getAll('work_days'),
    sub_notes: blank(formData.get('sub_notes')),
    contract_price: blank(formData.get('contract_price')),
    internal_notes: blank(formData.get('internal_notes')),
    managers: formData.getAll('managers'),
  })
}

function fieldErrors(err: z.ZodError) {
  const out: Record<string, string> = {}
  for (const i of err.issues) out[String(i.path[0])] ??= i.message
  return out
}

export async function createJob(_: JobFormState, formData: FormData): Promise<JobFormState> {
  const ctx = await requireBuilder('jobs', 'add')
  const parsed = parse(formData)
  if (!parsed.success) return { error: 'Check the highlighted fields.', fieldErrors: fieldErrors(parsed.error) }
  const { contract_price, internal_notes, managers, sub_notes, ...job } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('jobs').insert({ ...job, org_id: ctx.workspace.orgId }).select('id').single()
  if (error || !data) return { error: 'Could not create the job.' }
  if (sub_notes) await supabase.from('job_sub_notes').insert({ job_id: data.id, org_id: ctx.workspace.orgId, body: sub_notes })
  if (job.contract_type === 'open_book') {
    // open-book jobs start with the money visible to the client; the builder can switch it off per job
    const { data: def } = await supabase.from('client_permission_defaults').select('settings').eq('org_id', ctx.workspace.orgId).maybeSingle()
    await supabase.from('job_client_permissions').upsert({ job_id: data.id, settings: { ...((def?.settings ?? {}) as Record<string, unknown>), job_price_summary: true, budget: true, purchase_orders: true } })
  }
  const template = z.string().uuid().safeParse(formData.get('template_id'))
  if (template.success) {
    const parts = formData.getAll('template_parts').map(String).filter((p) => ['schedule', 'todos', 'selections', 'specs', 'estimate', 'folders'].includes(p))
    const { error: copyError } = await supabase.rpc('copy_job_content', { p_from: template.data, p_to: data.id, p_start: job.projected_start ?? todayIn(ctx.tz), p_parts: parts })
    if (copyError) return { error: 'The job was created, but the template could not be copied.' }
  }
  if (can(ctx, 'jobs', 'price') && (contract_price != null || internal_notes != null)) {
    await supabase.from('job_private').update({ contract_price, internal_notes }).eq('job_id', data.id)
  }
  if (managers.length) {
    await supabase.from('job_managers').insert(managers.map((user_id) => ({ job_id: data.id, user_id })))
    await supabase.from('job_members').upsert(managers.map((user_id) => ({ job_id: data.id, user_id })), { ignoreDuplicates: true })
  }
  await supabase.rpc('set_job_selection', { p_org: ctx.workspace.orgId, p_all: false, p_job_ids: [data.id] })
  revalidatePath('/', 'layout')
  redirect(`/jobs/${data.id}`)
}

export async function updateJob(jobId: string, _: JobFormState, formData: FormData): Promise<JobFormState> {
  const ctx = await requireBuilder('jobs', 'edit')
  z.string().uuid().parse(jobId)
  const parsed = parse(formData)
  if (!parsed.success) return { error: 'Check the highlighted fields.', fieldErrors: fieldErrors(parsed.error) }
  const { contract_price, internal_notes, managers, sub_notes, ...job } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('jobs').update(job).eq('id', jobId).select('id,org_id')
  if (error || !data?.length) return { error: 'Could not save the job. You may not have access to it.' }
  await supabase.from('job_sub_notes').upsert({ job_id: jobId, org_id: data[0].org_id, body: sub_notes ?? '' })
  if (can(ctx, 'jobs', 'price')) {
    await supabase.from('job_private').update({ contract_price, internal_notes }).eq('job_id', jobId)
  }
  const { data: current } = await supabase.from('job_managers').select('user_id').eq('job_id', jobId)
  const have = new Set((current ?? []).map((m) => m.user_id))
  const want = new Set(managers)
  const add = managers.filter((m) => !have.has(m))
  const remove = [...have].filter((m) => !want.has(m))
  if (add.length) {
    await supabase.from('job_managers').insert(add.map((user_id) => ({ job_id: jobId, user_id })))
    await supabase.from('job_members').upsert(add.map((user_id) => ({ job_id: jobId, user_id })), { ignoreDuplicates: true })
  }
  if (remove.length) await supabase.from('job_managers').delete().eq('job_id', jobId).in('user_id', remove)
  revalidatePath('/', 'layout')
  redirect(`/jobs/${jobId}`)
}

export async function deleteJob(jobId: string) {
  await requireBuilder('jobs', 'delete')
  z.string().uuid().parse(jobId)
  const supabase = await createClient()
  const { data } = await supabase.from('jobs').update({ deleted_at: new Date().toISOString() }).eq('id', jobId).select('id')
  if (!data?.length) throw new Error('Could not delete the job')
  revalidatePath('/', 'layout')
  redirect('/jobs')
}

// ----- job people ---------------------------------------------------------

export async function addJobSub(jobId: string, formData: FormData) {
  await requireBuilder('jobs', 'edit')
  const subOrgId = z.string().uuid().parse(formData.get('sub_org_id'))
  const supabase = await createClient()
  const { error } = await supabase.from('job_subs').insert({
    job_id: jobId,
    sub_org_id: subOrgId,
    can_view_owner_info: formData.get('can_view_owner_info') === 'on',
    can_share_with_client: formData.get('can_share_with_client') === 'on',
    can_assign_rfis_to_subs: formData.get('can_assign_rfis_to_subs') === 'on',
    see_all_schedule_items: formData.get('see_all_schedule_items') === 'on',
  })
  if (error) throw new Error('Could not add the sub to this job')
  revalidatePath(`/jobs/${jobId}`)
}

export async function removeJobSub(jobId: string, subOrgId: string) {
  await requireBuilder('jobs', 'edit')
  const supabase = await createClient()
  await supabase.from('job_subs').delete().eq('job_id', jobId).eq('sub_org_id', subOrgId)
  revalidatePath(`/jobs/${jobId}`)
}

const clientSchema = z.object({
  first_name: z.string().trim().min(1, 'Enter a first name').max(80),
  last_name: z.string().trim().max(80),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  phone: z.string().trim().max(40),
})

export async function addJobClient(jobId: string, _: JobFormState, formData: FormData): Promise<JobFormState> {
  await requireBuilder('clients', 'add')
  const parsed = clientSchema.safeParse({
    first_name: formData.get('first_name'), last_name: formData.get('last_name') ?? '',
    email: formData.get('email') ?? '', phone: formData.get('phone') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.from('job_clients').insert({
    job_id: jobId, ...parsed.data, email: parsed.data.email || null, phone: parsed.data.phone || null,
  }).select('id').single()
  if (error || !data) return { error: 'Could not add the client.' }
  if (formData.get('invite') === 'on' && parsed.data.email) {
    await supabase.rpc('invite_job_client', { p_job_client: data.id })
  }
  revalidatePath(`/jobs/${jobId}`)
  return {}
}

export async function inviteJobClient(jobId: string, jobClientId: string) {
  await requireBuilder('clients', 'add')
  const supabase = await createClient()
  const { error } = await supabase.rpc('invite_job_client', { p_job_client: jobClientId })
  if (error) throw new Error(error.message)
  revalidatePath(`/jobs/${jobId}`)
}

export async function removeJobClient(jobId: string, jobClientId: string) {
  await requireBuilder('clients', 'delete')
  const supabase = await createClient()
  await supabase.from('job_clients').delete().eq('id', jobClientId)
  revalidatePath(`/jobs/${jobId}`)
}

export async function setJobMember(jobId: string, userId: string, on: boolean) {
  await requireBuilder('jobs', 'edit')
  const supabase = await createClient()
  if (on) await supabase.from('job_members').upsert({ job_id: jobId, user_id: userId }, { ignoreDuplicates: true })
  else await supabase.from('job_members').delete().eq('job_id', jobId).eq('user_id', userId)
  revalidatePath(`/jobs/${jobId}`)
}

export async function saveAsTemplate(jobId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireBuilder('jobs', 'add')
  const title = z.string().trim().min(1, 'Name the template').max(120).safeParse(fd.get('title'))
  if (!title.success) return { error: title.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_as_template', { p_job: z.string().uuid().parse(jobId), p_title: title.data })
  if (error || !data) return { error: 'Could not save the template.' }
  revalidatePath('/', 'layout')
  redirect(`/jobs/${data}`)
}

/** Per-job client portal settings (override the company defaults). */
export async function saveJobPortal(jobId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireBuilder('jobs', 'edit')
  const supabase = await createClient()
  const { error } = await supabase.from('job_client_permissions').upsert({ job_id: z.string().uuid().parse(jobId), settings: parsePortalSettings(fd) })
  if (error) return { error: 'Could not save the portal settings.' }
  revalidatePath(`/jobs/${jobId}`)
  return { ok: 'Client portal settings saved for this job.' }
}
