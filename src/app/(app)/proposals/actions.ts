'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'
import { parseDecision } from '@/lib/signature'

const uuid = z.string().uuid()

const settingsSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200),
  intro: z.string().max(8000),
  closing: z.string().max(8000),
  approval_deadline: z.union([z.literal(''), z.string().date()]),
  collect_signature: z.boolean(), show_line_items: z.boolean(), show_quantities: z.boolean(),
})

export async function updateProposal(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const parsed = settingsSchema.safeParse({
    title: fd.get('title'), intro: fd.get('intro') ?? '', closing: fd.get('closing') ?? '', approval_deadline: fd.get('approval_deadline') ?? '',
    collect_signature: fd.get('collect_signature') === 'on', show_line_items: fd.get('show_line_items') === 'on', show_quantities: fd.get('show_quantities') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase.from('proposals').update({ ...d, intro: d.intro || null, closing: d.closing || null, approval_deadline: d.approval_deadline || null })
    .eq('id', uuid.parse(id)).select('id')
  if (error || !data?.length) return { error: 'Could not save. Only draft proposals can be changed.' }
  revalidatePath(`/proposals/${id}`)
  return { ok: 'Proposal saved.' }
}

export async function releaseProposal(id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('release_proposal', { p_proposal: uuid.parse(id) })
  if (error) throw new Error(error.message)
  revalidatePath(`/proposals/${id}`); revalidatePath('/proposals')
}

export async function deleteProposal(id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { data } = await supabase.from('proposals').delete().eq('id', uuid.parse(id)).select('job_id')
  if (!data?.length) throw new Error('Could not delete the proposal.')
  revalidatePath('/proposals')
  redirect(`/estimates/${data[0].job_id}`)
}

export async function decideProposal(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const d = await parseDecision(fd)
  if ('error' in d) return { error: d.error }
  const supabase = await createClient()
  const { error } = await supabase.rpc('decide_proposal', { p_proposal: uuid.parse(id), ...d.args })
  if (error) return { error: error.code === '23514' ? 'Add your signature to approve.' : error.code === '22023' ? error.message : 'Could not record the decision.' }
  revalidatePath(`/proposals/${id}`); revalidatePath('/proposals')
  return { ok: d.decision === 'approved' ? 'Approved. Thank you!' : 'Declined.' }
}
