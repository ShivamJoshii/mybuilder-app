'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'

export type RfiFormState = { error?: string; fieldErrors?: Record<string, string> }

const schema = z.object({
  job_id: z.string().uuid('Pick a job'),
  title: z.string().trim().min(1, 'Enter a title').max(200),
  question: z.string().trim().min(1, 'Ask your question').max(10000),
  due_date: z.string().date('Pick a due date'),
  assignee: z.string().regex(/^(builder|u:[0-9a-f-]{36}|s:[0-9a-f-]{36})$/),
  related: z.array(z.string().regex(/^[a-z_]+:[0-9a-f-]{36}$/)).max(50),
})

export async function createRfi(_: RfiFormState, fd: FormData): Promise<RfiFormState> {
  const ctx = await getAppContext()
  const parsed = schema.safeParse({
    job_id: fd.get('job_id'), title: fd.get('title'), question: fd.get('question'), due_date: fd.get('due_date'),
    assignee: fd.get('assignee') || 'builder', related: fd.getAll('related'),
  })
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message
    return { error: 'Check the highlighted fields.', fieldErrors: fe }
  }
  const d = parsed.data
  const job = ctx.jobs.find((j) => j.id === d.job_id)
  if (!job) return { error: 'Pick a job you have access to.' }
  const supabase = await createClient()
  const { data: rfi, error } = await supabase.from('rfis').insert({
    org_id: job.org_id, job_id: d.job_id, title: d.title, question: d.question, due_date: d.due_date,
    assignee_user_id: d.assignee.startsWith('u:') ? d.assignee.slice(2) : null,
    assignee_sub_org_id: d.assignee.startsWith('s:') ? d.assignee.slice(2) : null,
  }).select('id').single()
  if (error || !rfi) return { error: error?.message.includes('not allowed you') ? error.message : 'Could not create the RFI.' }
  if (d.related.length) {
    await supabase.from('related_items').insert(d.related.map((r) => {
      const [to_type, to_id] = r.split(':')
      return { org_id: job.org_id, job_id: d.job_id, from_type: 'rfi', from_id: rfi.id, to_type, to_id }
    }))
  }
  if (fd.get('intent') !== 'draft') await supabase.rpc('set_rfi_status', { p_rfi: rfi.id, p_action: 'send' })
  revalidatePath('/rfis')
  redirect(`/rfis/${rfi.id}`)
}

export async function rfiStatus(id: string, action: 'send' | 'complete' | 'reopen') {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_rfi_status', { p_rfi: z.string().uuid().parse(id), p_action: action })
  if (error) throw new Error(error.message)
  revalidatePath('/rfis'); revalidatePath(`/rfis/${id}`)
}

export async function respond(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const body = z.string().trim().min(1, 'Write a response').max(10000).safeParse(fd.get('body'))
  if (!body.success) return { error: body.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('rfi_responses').insert({ rfi_id: z.string().uuid().parse(id), body: body.data })
  if (error) return { error: 'Could not post your response. The RFI may be closed.' }
  revalidatePath(`/rfis/${id}`)
  return { ok: 'Response posted.' }
}
