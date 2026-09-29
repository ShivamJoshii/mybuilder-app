'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'
import type { Line } from '@/components/kit/lines-editor'
import { zonedToUtc } from '@/lib/utils'
import { lineSchema } from '@/lib/lines'

const uuid = z.string().uuid()
const pkgSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200), scope: z.string().max(20000),
  due: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]),
})
const dueAt = (d: string) => (d ? zonedToUtc(d) : null)   // entered in company time

export async function createBidPackage(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const job = ctx.jobs.find((j) => j.id === fd.get('job_id'))
  if (!job) return { error: 'Pick a job.' }
  const p = pkgSchema.safeParse({ title: fd.get('title'), scope: fd.get('scope') ?? '', due: fd.get('due') ?? '' })
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.from('bid_packages').insert({ org_id: job.org_id, job_id: job.id, number: 0, title: p.data.title, scope: p.data.scope || null, due_at: dueAt(p.data.due) }).select('id').single()
  if (error || !data) return { error: 'Could not create the bid package.' }
  revalidatePath('/bids')
  redirect(`/bids/${data.id}`)
}

export async function updateBidPackage(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const p = pkgSchema.safeParse({ title: fd.get('title'), scope: fd.get('scope') ?? '', due: fd.get('due') ?? '' })
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { data } = await supabase.from('bid_packages').update({ title: p.data.title, scope: p.data.scope || null, due_at: dueAt(p.data.due) }).eq('id', uuid.parse(id)).select('id')
  if (!data?.length) return { error: 'Could not save.' }
  revalidatePath(`/bids/${id}`)
  return { ok: 'Saved.' }
}

export async function saveBidLines(id: string, lines: Line[]) {
  await getAppContext()
  const parsed = z.array(lineSchema).max(500).safeParse(lines)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc('save_bid_items', { p_package: uuid.parse(id), p_items: parsed.data })
  if (error) return { error: error.code === '55000' ? error.message : 'Could not save the lines.' }
  revalidatePath(`/bids/${id}`)
  return { ok: true as const }
}

export async function setInvites(id: string, fd: FormData) {
  await getAppContext()
  const want = new Set(z.array(uuid).parse(fd.getAll('sub')))
  const supabase = await createClient()
  const { data: cur } = await supabase.from('bid_requests').select('id,sub_org_id,status').eq('package_id', id)
  const have = new Set((cur ?? []).map((r) => r.sub_org_id))
  const add = [...want].filter((s) => !have.has(s))
  const remove = (cur ?? []).filter((r) => !want.has(r.sub_org_id) && r.status === 'invited').map((r) => r.id)
  if (add.length) await supabase.from('bid_requests').insert(add.map((sub_org_id) => ({ package_id: id, sub_org_id })))
  if (remove.length) await supabase.from('bid_requests').delete().in('id', remove)
  revalidatePath(`/bids/${id}`)
}

export async function releaseBids(id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('release_bid_package', { p_package: uuid.parse(id) })
  if (error) throw new Error(error.message)
  revalidatePath(`/bids/${id}`); revalidatePath('/bids')
}

export async function submitBid(requestId: string, packageId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const prices: { item_id: string; unit_cost: number; notes: string }[] = []
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith('price:')) continue
    const n = Number(v)
    if (v === '' || !Number.isFinite(n) || n < 0) return { error: 'Enter a price (0 or more) for every line.' }
    prices.push({ item_id: uuid.parse(k.slice(6)), unit_cost: n, notes: String(fd.get(`note:${k.slice(6)}`) ?? '') })
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_bid', { p_request: uuid.parse(requestId), p_prices: prices, p_notes: String(fd.get('notes') ?? '') || undefined })
  if (error) return { error: error.code === '22023' || error.code === '23514' ? error.message : 'Could not submit your bid.' }
  revalidatePath(`/bids/${packageId}`); revalidatePath('/bids')
  return { ok: 'Bid submitted. You can update it until the deadline.' }
}

export async function declineBid(requestId: string, packageId: string, fd: FormData) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('decline_bid', { p_request: uuid.parse(requestId), p_reason: String(fd.get('reason') ?? '') || undefined })
  if (error) throw new Error(error.message)
  revalidatePath(`/bids/${packageId}`); revalidatePath('/bids')
}

export async function awardBid(requestId: string) {
  await getAppContext()
  const supabase = await createClient()
  const { data: po, error } = await supabase.rpc('award_bid', { p_request: uuid.parse(requestId) })
  if (error || !po) throw new Error(error?.message ?? 'Could not award')
  revalidatePath('/bids'); revalidatePath('/purchase-orders')
  redirect(`/purchase-orders/${po}`)
}
