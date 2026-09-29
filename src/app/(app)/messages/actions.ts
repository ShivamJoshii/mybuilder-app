'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import { jobAddress, sendMail } from '@/lib/email'
import type { ActionState } from '@/components/kit/action-form'

const emails = (v: FormDataEntryValue | null) => String(v ?? '').split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)
const emailList = z.array(z.string().email('One of the addresses isn’t valid')).max(50)

async function deliver(threadId: string, jobId: string, to: string[], cc: string[], subject: string, body: string, inReplyTo: string | null) {
  const ctx = await getAppContext()
  const supabase = await createClient()
  const [{ data: mb }, { data: org }] = await Promise.all([
    supabase.from('job_mailboxes').select('token').eq('job_id', jobId).single(),
    supabase.from('organizations').select('name').eq('id', ctx.workspace.mode === 'builder' ? ctx.workspace.orgId : '').maybeSingle(),
  ])
  if (!mb) return { error: 'This job has no mailbox.' }
  const messageId = `<${randomUUID()}@mybuilder.ca>`
  const fromName = `${ctx.profile.first_name} ${ctx.profile.last_name}`.trim() + (org ? ` · ${org.name}` : '')
  const { data: msg, error } = await supabase.from('email_messages').insert({
    thread_id: threadId, direction: 'out', from_email: ctx.email, from_name: fromName, to_emails: to, cc_emails: cc,
    subject, body_text: body, message_id: messageId, in_reply_to: inReplyTo, status: 'queued', sent_by: ctx.userId,
  }).select('id').single()
  if (error || !msg) return { error: 'Could not save the message.' }
  const r = await sendMail({ fromName, replyTo: jobAddress(mb.token), to, cc, subject, text: body, messageId, inReplyTo })
  if (r.status !== 'queued') await supabase.from('email_messages').update({ status: r.status, error: r.error ?? null }).eq('id', msg.id)
  return { ok: r.status }
}

export async function newMessage(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const job = ctx.jobs.find((j) => j.id === fd.get('job_id'))
  if (!job) return { error: 'Pick a job.' }
  const to = emailList.safeParse([...emails(fd.get('to')), ...fd.getAll('pick').map(String)])
  const cc = emailList.safeParse(emails(fd.get('cc')))
  if (!to.success || !to.data.length) return { error: to.success ? 'Add at least one recipient.' : to.error.issues[0].message }
  if (!cc.success) return { error: cc.error.issues[0].message }
  const subject = z.string().trim().min(1, 'Add a subject').max(300).safeParse(fd.get('subject'))
  const body = z.string().trim().min(1, 'Write your message').max(100_000).safeParse(fd.get('body'))
  if (!subject.success) return { error: subject.error.issues[0].message }
  if (!body.success) return { error: body.error.issues[0].message }
  const supabase = await createClient()
  const { data: t, error } = await supabase.from('email_threads').insert({ org_id: job.org_id, job_id: job.id, subject: subject.data }).select('id').single()
  if (error || !t) return { error: 'You can’t send messages on this job.' }
  const r = await deliver(t.id, job.id, [...new Set(to.data)], [...new Set(cc.data)], subject.data, body.data, null)
  if (r.error) return { error: r.error }
  revalidatePath('/messages')
  redirect(`/messages/${t.id}`)
}

export async function reply(threadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const supabase = await createClient()
  const { data: t } = await supabase.from('email_threads').select('id,job_id,subject').eq('id', threadId).single()
  if (!t) return { error: 'Thread not found.' }
  const { data: last } = await supabase.from('email_messages').select('message_id,from_email,to_emails,cc_emails,direction').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(1).single()
  const to = emailList.safeParse(emails(fd.get('to')))
  const body = z.string().trim().min(1, 'Write your reply').max(100_000).safeParse(fd.get('body'))
  if (!to.success || !to.data.length) return { error: 'Add at least one recipient.' }
  if (!body.success) return { error: body.error.issues[0].message }
  const subject = /^re:/i.test(t.subject) ? t.subject : `Re: ${t.subject}`
  const r = await deliver(threadId, t.job_id, to.data, emails(fd.get('cc')), subject, body.data, last?.message_id ?? null)
  if (r.error) return { error: r.error }
  revalidatePath(`/messages/${threadId}`); revalidatePath('/messages')
  return { ok: r.ok === 'sent' ? 'Sent.' : r.ok === 'queued' ? 'Saved. It will send once email is connected.' : 'Saved, but sending failed. Try again later.' }
}
