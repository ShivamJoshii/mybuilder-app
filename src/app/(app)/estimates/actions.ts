'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import { taxFor } from '@/lib/tax'

const uuid = z.string().uuid()
const num = z.coerce.number().finite()

export async function startEstimate(jobId: string) {
  const ctx = await getAppContext()
  const job = ctx.jobs.find((j) => j.id === uuid.parse(jobId))
  if (!job) throw new Error('Job not found')
  const supabase = await createClient()
  const [{ data: j }, { data: org }] = await Promise.all([
    supabase.from('jobs').select('province').eq('id', job.id).single(),
    supabase.from('organizations').select('province').eq('id', job.org_id).single(),
  ])
  const tax = taxFor(j?.province || org?.province)
  const { error } = await supabase.from('estimates').insert({ org_id: job.org_id, job_id: job.id, tax_rate: tax.rate, tax_label: tax.label })
  if (error && error.code !== '23505') throw new Error('Could not start the estimate.')
  revalidatePath(`/estimates/${job.id}`)
}

const groupSchema = z.object({
  id: uuid, name: z.string().trim().min(1, 'Every group needs a name').max(120), sort: z.number().int(),
  is_optional: z.boolean(), option_status: z.enum(['pending', 'approved', 'declined']),
})
const itemSchema = z.object({
  id: uuid, group_id: uuid.nullable(), cost_code_id: uuid.nullable(),
  cost_type: z.enum(['labor', 'material', 'equipment', 'subcontractor', 'other', 'none']),
  title: z.string().trim().min(1, 'Every line needs a title').max(200),
  description: z.string().max(4000).nullable(), internal_notes: z.string().max(4000).nullable(),
  quantity: num.min(-1e9).max(1e9), unit: z.string().trim().max(20), unit_cost: num.min(0, 'Unit cost cannot be negative').max(1e10),
  markup_type: z.enum(['percent', 'amount']), markup_value: num.min(-1e9).max(1e10), taxable: z.boolean(),
  marked_as: z.enum(['none', 'allowance', 'bid', 'selection']), sort: z.number().int(),
})
const saveSchema = z.object({
  settings: z.object({ default_markup_pct: num.min(0).max(1000), tax_rate: num.min(0).max(100), tax_label: z.string().trim().min(1).max(30) }),
  groups: z.array(groupSchema).max(500),
  items: z.array(itemSchema).max(5000),
})

export type SaveResult = { ok?: true; error?: string; savedAt?: string }

export async function saveEstimate(estimateId: string, jobId: string, payload: unknown): Promise<SaveResult> {
  await getAppContext()
  const parsed = saveSchema.safeParse(payload)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { settings, groups, items } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('save_estimate', { p_estimate: uuid.parse(estimateId), p_settings: settings, p_groups: groups, p_items: items })
  if (error) return { error: error.code === '55000' ? error.message : 'Could not save the estimate. Check your permissions and try again.' }
  revalidatePath(`/estimates/${jobId}`)
  return { ok: true, savedAt: new Date().toISOString() }
}

export async function createProposal(estimateId: string, jobId: string) {
  await getAppContext()
  const supabase = await createClient()
  const { data: job } = await supabase.from('jobs').select('org_id,title').eq('id', uuid.parse(jobId)).single()
  if (!job) throw new Error('Job not found')
  const { count } = await supabase.from('proposals').select('id', { count: 'exact', head: true }).eq('estimate_id', estimateId)
  const { data, error } = await supabase.from('proposals').insert({
    org_id: job.org_id, job_id: jobId, estimate_id: uuid.parse(estimateId),
    title: count ? `${job.title} proposal ${count + 1}` : `${job.title} proposal`,
    intro: 'Thank you for the opportunity to quote your project. The scope and pricing below are based on the plans and our site visit.',
    closing: 'Prices are valid for 30 days. Signing below approves the scope and pricing in this proposal.',
  }).select('id').single()
  if (error || !data) throw new Error('Could not create the proposal.')
  revalidatePath('/proposals')
  redirect(`/proposals/${data.id}`)
}

export async function sendToBudget(estimateId: string, jobId: string) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('send_estimate_to_budget', { p_estimate: uuid.parse(estimateId) })
  if (error) throw new Error(error.message)
  revalidatePath(`/estimates/${jobId}`)
}

export async function unlockEstimate(estimateId: string, jobId: string) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('unlock_estimate', { p_estimate: uuid.parse(estimateId) })
  if (error) throw new Error(error.message)
  revalidatePath(`/estimates/${jobId}`)
}
