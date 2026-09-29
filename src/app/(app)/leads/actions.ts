'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireBuilder, hasAction } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'

export type LeadFormState = { error?: string; fieldErrors?: Record<string, string> }
const blank = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const postal = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/

const schema = z.object({
  title: z.string().trim().min(1, 'Name the opportunity').max(120),
  status_id: z.string().uuid(),
  contact_first: z.string().max(80), contact_last: z.string().max(80),
  contact_email: z.string().email('Enter a valid email').nullable(), contact_phone: z.string().max(40).nullable(),
  site_street: z.string().max(200).nullable(), site_city: z.string().max(100).nullable(), site_province: z.string().length(2).nullable(),
  site_postal: z.string().regex(postal, 'Use a Canadian postal code').nullable(),
  confidence: z.coerce.number().int().min(0).max(100).nullable(),
  est_revenue_min: z.coerce.number().min(0).nullable(), est_revenue_max: z.coerce.number().min(0).nullable(),
  projected_sale_date: z.string().date().nullable(),
  source_ids: z.array(z.string().uuid()), project_type_ids: z.array(z.string().uuid()),
  notes: z.string().max(8000).nullable(),
  salespeople: z.array(z.string().uuid()),
}).refine((d) => d.est_revenue_min == null || d.est_revenue_max == null || d.est_revenue_max >= d.est_revenue_min, { path: ['est_revenue_max'], message: 'Max must be at least the min' })

function parse(fd: FormData) {
  return schema.safeParse({
    title: fd.get('title'), status_id: fd.get('status_id'),
    contact_first: String(fd.get('contact_first') ?? '').trim(), contact_last: String(fd.get('contact_last') ?? '').trim(),
    contact_email: blank(fd.get('contact_email')), contact_phone: blank(fd.get('contact_phone')),
    site_street: blank(fd.get('site_street')), site_city: blank(fd.get('site_city')), site_province: blank(fd.get('site_province')),
    site_postal: blank(fd.get('site_postal')), confidence: blank(fd.get('confidence')),
    est_revenue_min: blank(fd.get('est_revenue_min')), est_revenue_max: blank(fd.get('est_revenue_max')),
    projected_sale_date: blank(fd.get('projected_sale_date')), source_ids: fd.getAll('source_ids'), project_type_ids: fd.getAll('project_type_ids'),
    notes: blank(fd.get('notes')), salespeople: fd.getAll('salespeople'),
  })
}
const errs = (e: z.ZodError) => { const fe: Record<string, string> = {}; for (const i of e.issues) fe[String(i.path[0])] ??= i.message; return { error: 'Check the highlighted fields.', fieldErrors: fe } }

async function syncSalespeople(leadId: string, want: string[]) {
  const supabase = await createClient()
  const { data } = await supabase.from('lead_salespeople').select('user_id').eq('lead_id', leadId)
  const have = new Set((data ?? []).map((d) => d.user_id))
  const add = want.filter((w) => !have.has(w))
  const remove = [...have].filter((h) => !want.includes(h))
  if (add.length) await supabase.from('lead_salespeople').insert(add.map((user_id) => ({ lead_id: leadId, user_id })))
  if (remove.length) await supabase.from('lead_salespeople').delete().eq('lead_id', leadId).in('user_id', remove)
}

export async function createLead(_: LeadFormState, fd: FormData): Promise<LeadFormState> {
  const ctx = await requireBuilder('leads', 'add')
  const p = parse(fd)
  if (!p.success) return errs(p.error)
  const { salespeople, ...lead } = p.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('leads').insert({ ...lead, org_id: ctx.workspace.orgId }).select('id').single()
  if (error || !data) return { error: 'Could not create the lead.' }
  await syncSalespeople(data.id, salespeople.length ? salespeople : [ctx.userId])
  revalidatePath('/leads')
  redirect(`/leads/${data.id}`)
}

export async function updateLead(id: string, _: LeadFormState, fd: FormData): Promise<LeadFormState> {
  await requireBuilder('leads', 'edit')
  const p = parse(fd)
  if (!p.success) return errs(p.error)
  const { salespeople, ...lead } = p.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('leads').update(lead).eq('id', id).select('id')
  if (error || !data?.length) return { error: 'Could not save the lead.' }
  await syncSalespeople(id, salespeople)
  revalidatePath('/leads'); revalidatePath(`/leads/${id}`)
  redirect(`/leads/${id}`)
}

export async function setLeadStatus(id: string, statusId: string) {
  await requireBuilder('leads', 'edit')
  const supabase = await createClient()
  await supabase.from('leads').update({ status_id: z.string().uuid().parse(statusId) }).eq('id', z.string().uuid().parse(id))
  revalidatePath('/leads'); revalidatePath(`/leads/${id}`)
}

export async function markLost(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireBuilder('leads', 'edit')
  const supabase = await createClient()
  const { data: lost } = await supabase.from('lead_statuses').select('id').eq('org_id', ctx.workspace.orgId).eq('category', 'lost').order('sort').limit(1).single()
  const { error } = await supabase.from('leads').update({ status_id: lost!.id, lost_reason_id: blank(fd.get('lost_reason_id')), lost_notes: blank(fd.get('lost_notes')) }).eq('id', id)
  if (error) return { error: 'Could not update the lead.' }
  revalidatePath('/leads'); revalidatePath(`/leads/${id}`)
  return { ok: 'Marked as lost.' }
}

export async function convertLead(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireBuilder('leads', 'view')
  if (!hasAction(ctx, 'leads.convert')) return { error: 'Your role can’t convert leads.' }
  const title = z.string().trim().min(1, 'Name the job').max(120).safeParse(fd.get('title'))
  if (!title.success) return { error: title.error.issues[0].message }
  const amount = blank(fd.get('amount'))
  const supabase = await createClient()
  const { data: jobId, error } = await supabase.rpc('convert_lead_to_job', {
    p_lead: id, p_title: title.data, p_contract: fd.get('contract_type') === 'open_book' ? 'open_book' : 'fixed_price',
    p_amount: amount == null ? undefined : Number(amount),
  })
  if (error || !jobId) return { error: error?.message ?? 'Could not convert the lead.' }
  revalidatePath('/', 'layout')
  redirect(`/jobs/${jobId}`)
}

export async function deleteLead(id: string) {
  await requireBuilder('leads', 'delete')
  const supabase = await createClient()
  await supabase.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/leads')
  redirect('/leads')
}

// ----- activities -----------------------------------------------------------

export async function addActivity(leadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireBuilder('leads', 'add')
  const p = z.object({
    type: z.enum(['call', 'email', 'meeting', 'follow_up', 'sms', 'note']),
    title: z.string().max(120).nullable(),
    activity_date: z.string().date('Pick a date'),
    start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    assigned_to: z.string().uuid().nullable(),
    description: z.string().max(8000).nullable(),
    initiated_by: z.enum(['us', 'lead']),
    done: z.boolean(),
  }).safeParse({
    type: fd.get('type'), title: blank(fd.get('title')), activity_date: fd.get('activity_date'), start_time: blank(fd.get('start_time')),
    assigned_to: blank(fd.get('assigned_to')), description: blank(fd.get('description')), initiated_by: fd.get('initiated_by') ?? 'us', done: fd.get('done') === 'on',
  })
  if (!p.success) return { error: p.error.issues[0].message }
  const { done, ...a } = p.data
  const supabase = await createClient()
  const { data: lead } = await supabase.from('leads').select('org_id').eq('id', leadId).single()
  const { error } = await supabase.from('lead_activities').insert({ ...a, org_id: lead!.org_id, lead_id: leadId, completed_at: done ? new Date().toISOString() : null })
  if (error) return { error: 'Could not save the activity.' }
  revalidatePath(`/leads/${leadId}`); revalidatePath('/lead-activities')
  return { ok: done ? 'Activity logged.' : 'Activity scheduled.' }
}

export async function completeActivity(id: string, leadId: string, done: boolean) {
  await requireBuilder('leads', 'edit')
  const supabase = await createClient()
  await supabase.from('lead_activities').update({ completed_at: done ? new Date().toISOString() : null }).eq('id', id)
  revalidatePath(`/leads/${leadId}`); revalidatePath('/lead-activities')
}
