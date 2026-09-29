'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, requireBuilder } from '@/lib/context'
import { zonedToUtc } from '@/lib/utils'

export type TodoFormState = { error?: string; fieldErrors?: Record<string, string> }

const schema = z.object({
  job_id: z.string().uuid('Pick a job'),
  title: z.string().trim().min(1, 'Enter a title').max(200),
  notes: z.string().max(8000).nullable(),
  priority: z.enum(['low', 'medium', 'high']),
  due_date: z.string().date().nullable(),
  due_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  reminder_minutes: z.coerce.number().int().min(0).max(20160).nullable(),
  assignees: z.array(z.string().regex(/^[us]:[0-9a-f-]{36}$/)),
  checklist: z.array(z.string().trim().min(1).max(300)).max(100),
})

const blank = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export async function createTodo(_: TodoFormState, fd: FormData): Promise<TodoFormState> {
  const ctx = await requireBuilder('todos', 'add')
  const parsed = schema.safeParse({
    job_id: fd.get('job_id'), title: fd.get('title'), notes: blank(fd.get('notes')),
    priority: fd.get('priority') ?? 'medium', due_date: blank(fd.get('due_date')), due_time: blank(fd.get('due_time')),
    reminder_minutes: blank(fd.get('reminder_minutes')), assignees: fd.getAll('assignees'),
    checklist: String(fd.get('checklist') ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
  })
  if (!parsed.success) {
    const fe: Record<string, string> = {}
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message
    return { error: 'Check the highlighted fields.', fieldErrors: fe }
  }
  const d = parsed.data
  // Deadline is stored as an instant; date-only deadlines are end of day in the company time zone (approx. local)
  const due_at = d.due_date ? zonedToUtc(`${d.due_date}T${d.due_time ?? '23:59'}`, ctx.tz) : null
  const supabase = await createClient()
  const { data: todo, error } = await supabase.from('todos').insert({
    org_id: ctx.workspace.orgId, job_id: d.job_id, title: d.title, notes: d.notes, priority: d.priority,
    due_at, has_due_time: Boolean(d.due_time), reminder_minutes: d.reminder_minutes, created_by: ctx.userId,
  }).select('id').single()
  if (error || !todo) return { error: 'Could not create the to-do. Check you have access to that job.' }
  if (d.assignees.length) {
    const { error: e2 } = await supabase.from('todo_assignees').insert(d.assignees.map((a) =>
      a.startsWith('u:') ? { todo_id: todo.id, user_id: a.slice(2) } : { todo_id: todo.id, sub_org_id: a.slice(2) }))
    if (e2) return { error: 'The to-do was created, but some assignees are not on this job.' }
  }
  if (d.checklist.length) {
    await supabase.from('todo_checklist').insert(d.checklist.map((body, i) => ({ todo_id: todo.id, body, sort: i })))
  }
  revalidatePath('/todos')
  redirect(`/todos/${todo.id}`)
}

export async function toggleTodo(id: string, done: boolean) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_todo_complete', { p_todo: z.string().uuid().parse(id), p_done: done })
  if (error) return { error: error.message }
  revalidatePath('/todos'); revalidatePath(`/todos/${id}`)
  return {}
}

export async function toggleChecklistItem(todoId: string, itemId: string, done: boolean) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.rpc('set_checklist_item', { p_item: z.string().uuid().parse(itemId), p_done: done })
  revalidatePath(`/todos/${todoId}`)
}

export async function deleteTodo(id: string) {
  await requireBuilder('todos', 'delete')
  const supabase = await createClient()
  await supabase.from('todos').update({ deleted_at: new Date().toISOString() }).eq('id', z.string().uuid().parse(id))
  revalidatePath('/todos')
  redirect('/todos')
}
