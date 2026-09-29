import type { Metadata } from 'next'
import { requireBuilder, selectedJobs } from '@/lib/context'
import { fetchAssignable } from '@/lib/todos'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Hammer } from 'lucide-react'
import { TodoForm } from './todo-form'

export const metadata: Metadata = { title: 'New to-do' }

export default async function NewTodoPage() {
  const ctx = await requireBuilder('todos', 'add')
  const jobs = ctx.jobs.filter((j) => j.status !== 'closed').map((j) => ({ id: j.id, title: j.title }))
  if (jobs.length === 0) return <div className="p-5"><Card><EmptyState icon={Hammer} title="Add a job first" body="To-dos belong to a job." /></Card></div>
  const assignable = await fetchAssignable(ctx.workspace.orgId, jobs.map((j) => j.id))
  const picked = selectedJobs(ctx)
  return <TodoForm jobs={jobs} assignable={assignable} defaultJob={picked.length === 1 ? picked[0].id : undefined} />
}
