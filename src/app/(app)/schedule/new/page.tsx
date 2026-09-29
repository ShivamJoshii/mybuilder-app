import { todayIn } from '@/lib/utils'
import type { Metadata } from 'next'
import { Hammer } from 'lucide-react'
import { requireBuilder, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchAssignable } from '@/lib/todos'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ItemForm } from '../item-form'
import { createItem } from '../actions'

export const metadata: Metadata = { title: 'New schedule item' }

export default async function NewItemPage() {
  const ctx = await requireBuilder('schedule', 'add')
  const jobs = ctx.jobs.filter((j) => j.status !== 'closed')
  if (jobs.length === 0) return <div className="p-5"><Card><EmptyState icon={Hammer} title="No open jobs" body="Schedule items belong to a job." /></Card></div>
  const ids = jobs.map((j) => j.id)
  const supabase = await createClient()
  const { data: phases } = await supabase.from('schedule_phases').select('job_id,name').in('job_id', ids).order('sort')
  const byJob: Record<string, string[]> = {}
  for (const p of phases ?? []) (byJob[p.job_id] ??= []).push(p.name)
  const picked = selectedJobs(ctx)
  const first = picked.length === 1 ? picked[0].id : jobs[0].id
  return (
    <ItemForm title="New schedule item" action={createItem} cancelHref="/schedule" today={todayIn(ctx.tz)}
      jobs={[jobs.find((j) => j.id === first)!, ...jobs.filter((j) => j.id !== first)].map((j) => ({ id: j.id, title: j.title }))}
      assignable={await fetchAssignable(ctx.workspace.orgId, ids)} phases={byJob} values={{ job_id: first, color: jobs.find((j) => j.id === first)?.color }} />
  )
}
