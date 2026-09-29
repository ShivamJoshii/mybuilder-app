'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'

const schema = z.object({
  job_id: z.string().uuid(),
  record_type: z.string().regex(/^[a-z_]{2,40}$/),
  record_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable(),
  body: z.string().trim().min(1, 'Write a comment first').max(4000, 'Keep comments under 4,000 characters'),
  subs: z.boolean(),
  clients: z.boolean(),
  path: z.string().startsWith('/'),
})

export async function postComment(_: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const parsed = schema.safeParse({
    job_id: fd.get('job_id'), record_type: fd.get('record_type'), record_id: fd.get('record_id'),
    parent_id: fd.get('parent_id') || null, body: fd.get('body'),
    subs: fd.get('subs') === 'on', clients: fd.get('clients') === 'on', path: fd.get('path') ?? '/',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('add_comment', {
    p_job: d.job_id, p_record_type: d.record_type, p_record_id: d.record_id, p_body: d.body,
    p_parent: d.parent_id ?? undefined, p_visible_to_subs: d.subs, p_visible_to_clients: d.clients,
  })
  if (error) return { error: 'Could not post your comment.' }
  revalidatePath(d.path)
  return { ok: 'Posted.' }
}

export async function deleteComment(id: string, path: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('comments').update({ deleted_at: new Date().toISOString() }).eq('id', z.string().uuid().parse(id))
  revalidatePath(path)
}
