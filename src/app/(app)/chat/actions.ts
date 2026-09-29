'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'

const uuid = z.string().uuid()

export async function chatFeed(conv: string, after: string | null) {
  await getAppContext()
  const supabase = await createClient()
  const { data } = await supabase.rpc('chat_feed', { p_conv: uuid.parse(conv), p_after: after ?? undefined })
  if (data?.length) await supabase.rpc('mark_chat_read', { p_conv: conv })
  return data ?? []
}

export async function sendChat(conv: string, body: string) {
  await getAppContext()
  const b = z.string().trim().min(1).max(4000).safeParse(body)
  if (!b.success) return { error: 'Messages can be up to 4,000 characters.' }
  const supabase = await createClient()
  const { error } = await supabase.from('chat_messages').insert({ conversation_id: uuid.parse(conv), body: b.data })
  if (error) return { error: 'Could not send. You may have been removed from this chat.' }
  return { ok: true }
}

export async function chatDirectory(org: string, job: string | null) {
  await getAppContext()
  const supabase = await createClient()
  const { data } = await supabase.rpc('chat_directory', { p_org: uuid.parse(org), p_job: job ? uuid.parse(job) : undefined })
  return data ?? []
}

export async function startChat(input: { org: string; job: string | null; users: string[]; title: string; body: string }) {
  await getAppContext()
  const d = z.object({ org: uuid, job: uuid.nullable(), users: z.array(uuid).min(1, 'Pick at least one person').max(50), title: z.string().trim().max(120), body: z.string().trim().max(4000) }).safeParse(input)
  if (!d.success) return { error: d.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('start_conversation', { p_org: d.data.org, p_job: d.data.job as string /* null = no job */, p_users: d.data.users,
    p_title: d.data.users.length > 1 ? d.data.title || undefined : undefined, p_body: d.data.body || undefined })
  if (error || !data) return { error: error?.code === '42501' ? error.message : 'Could not start the chat.' }
  revalidatePath('/chat')
  return { id: data }
}
