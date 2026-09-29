import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchTodos } from '@/lib/todos'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CommentThread } from '@/components/kit/comments'
import { Attachments } from '@/components/kit/attachments'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { TodoCheck } from '../todo-check'
import { ChecklistItem } from './checklist-item'
import { deleteTodo } from '../actions'
import { CustomFields } from '@/components/kit/custom-fields'
import { formatDateTime } from '@/lib/utils'

export const metadata: Metadata = { title: 'To-do' }

export default async function TodoPage({ params }: PageProps<'/todos/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: base } = await supabase.from('todos').select('job_id').eq('id', id).maybeSingle()
  if (!base) notFound()
  const [todo] = (await fetchTodos([base.job_id])).filter((t) => t.id === id)
  if (!todo) notFound()
  const { data: items } = await supabase.from('todo_checklist').select('id,body,done_at').eq('todo_id', id).order('sort')
  const jobTitle = ctx.jobs.find((j) => j.id === todo.job_id)?.title
  const open = (items ?? []).filter((i) => !i.done_at).length

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost"><Link href="/todos"><ArrowLeft />To-dos</Link></Button>
        {can(ctx, 'todos', 'delete') && (
          <form action={deleteTodo.bind(null, id)}>
            <ConfirmSubmit variant="ghost" title="Delete this to-do?" body="It will be removed for everyone assigned."><Trash2 />Delete</ConfirmSubmit>
          </form>
        )}
      </div>
      <Card>
        <div className="flex items-start gap-3 p-4">
          <span className="pt-1"><TodoCheck id={id} done={Boolean(todo.completed_at)} disabled={open > 0 && !todo.completed_at} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-text-3"><Link href={`/jobs/${todo.job_id}`} className="hover:underline">{jobTitle}</Link></div>
            <h1 className={`text-xl font-semibold ${todo.completed_at ? 'text-text-3 line-through' : ''}`}>{todo.title}</h1>
            <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
              {todo.completed_at ? <Badge tone="success">Complete</Badge> : <Badge>Pending</Badge>}
              <Badge tone={todo.priority === 'high' ? 'danger' : todo.priority === 'low' ? 'neutral' : 'brand'}>{todo.priority} priority</Badge>
              {todo.due_at && <Badge tone={!todo.completed_at && new Date(todo.due_at) < new Date() ? 'danger' : 'neutral'}>
                Due {todo.has_due_time ? formatDateTime(todo.due_at, ctx.tz) : formatDateTime(todo.due_at, ctx.tz).replace(/,\s*\d{1,2}:\d{2}.*$/, '')}
              </Badge>}
            </div>
          </div>
        </div>
        <dl className="grid gap-3 border-t border-border p-4 text-[13px] sm:grid-cols-2">
          <div><dt className="text-xs text-text-3">Assigned to</dt><dd>{todo.assignees.map((a) => a.label).join(', ') || 'Nobody'}</dd></div>
          <div><dt className="text-xs text-text-3">Created by</dt><dd>{todo.creator}</dd></div>
          {todo.notes && <div className="sm:col-span-2"><dt className="text-xs text-text-3">Notes</dt><dd className="whitespace-pre-wrap">{todo.notes}</dd></div>}
        </dl>
      </Card>
      {(items ?? []).length > 0 && (
        <Card>
          <CardHeader title="Checklist" description={`${(items ?? []).length - open} of ${(items ?? []).length} done`} />
          <ul className="divide-y divide-border">
            {(items ?? []).map((i) => <ChecklistItem key={i.id} todoId={id} id={i.id} body={i.body} done={Boolean(i.done_at)} />)}
          </ul>
        </Card>
      )}
      <CustomFields module="todos" recordId={id} orgId={ctx.jobs.find((j) => j.id === todo.job_id)?.org_id ?? ''} path={`/todos/${id}`} canEdit={ctx.workspace.mode === 'builder' && can(ctx, 'todos', 'edit')} audience={ctx.workspace.mode === 'builder' ? 'internal' : ctx.workspace.mode} />
      <Attachments jobId={todo.job_id} recordType="todo" recordId={id} path={`/todos/${id}`} share={{ subs: todo.assignees.some((a) => a.sub_org_id), clients: false }} />
      <CommentThread jobId={todo.job_id} recordType="todo" recordId={id} mode={ctx.workspace.mode} path={`/todos/${id}`} canShareWithClient={false} />
    </div>
  )
}
