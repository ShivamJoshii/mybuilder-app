import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckSquare, Plus } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { fetchTodos, applyTodoQuery } from '@/lib/todos'
import { fetchViews } from '@/lib/views'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { QueryBuilder, decodeRows, type QField, type QRow } from '@/components/kit/query-builder'
import { SavedViews } from '@/components/kit/saved-views'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { TodoCheck } from './todo-check'

export const metadata: Metadata = { title: 'To-dos' }

const DEFAULT: QRow[] = [{ field: 'assignee', op: 'is', value: 'me' }, { field: 'status', op: 'is', value: 'open' }]

function due(t: { due_at: string | null; has_due_time: boolean; completed_at: string | null }, tz: string) {
  if (!t.due_at) return null
  const d = new Date(t.due_at)
  const late = !t.completed_at && d < new Date()
  const text = d.toLocaleDateString('en-CA', { timeZone: tz, month: 'short', day: 'numeric' }) + (t.has_due_time ? ` ${d.toLocaleTimeString('en-CA', { timeZone: tz, hour: 'numeric', minute: '2-digit' })}` : '')
  return <span className={late ? 'font-medium text-danger' : 'text-text-2'}>{late ? `Overdue · ${text}` : text}</span>
}

export default async function TodosPage({ searchParams }: PageProps<'/todos'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  if (ctx.workspace.mode === 'client') redirect('/summary')
  if (ctx.workspace.mode === 'builder' && !can(ctx, 'todos')) redirect('/summary?denied=todos')
  const picked = selectedJobs(ctx)
  const all = await fetchTodos(picked.map((j) => j.id))
  const f = sp.f == null ? [] : Array.isArray(sp.f) ? sp.f : [sp.f]
  const rows: QRow[] = f.length ? decodeRows(f.filter(Boolean)) : DEFAULT
  const mySubs = ctx.orgs.filter((o) => o.kind === 'sub').map((o) => o.org_id)
  const todos = applyTodoQuery(all, rows, ctx.userId, mySubs)
  const views = await fetchViews(ctx, 'todos')
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))

  const people = new Map<string, string>()
  for (const t of all) for (const a of t.assignees) people.set(a.key, a.label)
  const fields: QField[] = [
    { key: 'title', label: 'Task title', type: 'text' },
    { key: 'assignee', label: 'Assignee', type: 'enum', options: [{ value: 'me', label: 'Me' }, { value: 'none', label: 'Nobody' }, ...[...people].map(([value, label]) => ({ value, label }))] },
    { key: 'status', label: 'Status', type: 'enum', options: [{ value: 'open', label: 'Not completed' }, { value: 'completed', label: 'Completed' }, { value: 'overdue', label: 'Overdue' }] },
    { key: 'priority', label: 'Priority', type: 'enum', options: [{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }] },
    { key: 'due', label: 'Due date', type: 'date' },
    { key: 'created_by', label: 'Created by', type: 'enum', options: [{ value: 'me', label: 'Me' }] },
    { key: 'modified', label: 'Modified on', type: 'date' },
  ]

  return (
    <>
      <PageHeader title="To-dos" jobName={selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length)}
        actions={<>
          <SavedViews module="todos" views={views} canShare={ctx.workspace.mode === 'builder'} />
          {can(ctx, 'todos', 'add') && <Button asChild variant="primary"><Link href="/todos/new"><Plus />New to-do</Link></Button>}
        </>}>
        <div className="mt-3"><QueryBuilder fields={fields} defaults={DEFAULT} /></div>
      </PageHeader>
      {picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="p-5">
        <Card>
          {todos.length === 0 ? (
            <EmptyState icon={CheckSquare} title={all.length ? 'Nothing matches these filters' : 'No to-dos yet'}
              body={all.length ? 'Change the filters to see more.' : 'Assign work to your team, trades or clients and track it to done.'} />
          ) : (
            <ul className="divide-y divide-border">
              {todos.map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                  <TodoCheck id={t.id} done={Boolean(t.completed_at)} disabled={t.checklist.done < t.checklist.total && !t.completed_at} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/todos/${t.id}`} className={`font-medium hover:text-brand hover:underline ${t.completed_at ? 'text-text-3 line-through' : ''}`}>{t.title}</Link>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-text-3">
                      <span>{jobName.get(t.job_id)}</span>
                      {t.assignees.length > 0 && <span>{t.assignees.map((a) => a.label).join(', ')}</span>}
                      {t.checklist.total > 0 && <span>{t.checklist.done}/{t.checklist.total} checklist</span>}
                    </div>
                  </div>
                  {t.priority === 'high' && <Badge tone="danger">High</Badge>}
                  <span className="shrink-0 text-xs">{due(t, ctx.tz)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
