import { todayIn } from '@/lib/utils'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireBuilder } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchAssignable } from '@/lib/todos'
import { fetchItemNotes, fetchSchedule } from '@/lib/schedule/data'
import { ItemForm } from '../../item-form'
import { updateItem } from '../../actions'

export const metadata: Metadata = { title: 'Edit schedule item' }

export default async function EditItemPage({ params }: PageProps<'/schedule/[id]/edit'>) {
  const { id } = await params
  const ctx = await requireBuilder('schedule', 'edit')
  const supabase = await createClient()
  const { data: base } = await supabase.from('schedule_items').select('job_id').eq('id', id).maybeSingle()
  if (!base) notFound()
  const { items, online, phases } = await fetchSchedule([base.job_id])
  const item = items.find((i) => i.id === id)
  if (!item) notFound()
  const job = ctx.jobs.find((j) => j.id === base.job_id)!
  return (
    <ItemForm title={`Edit ${item.title}`} action={updateItem.bind(null, id)} cancelHref={`/schedule/${id}`} isEdit online={Boolean(online.get(base.job_id))}
      today={todayIn(ctx.tz)} jobs={[{ id: job.id, title: job.title }]} assignable={await fetchAssignable(ctx.workspace.orgId, [job.id])}
      phases={{ [job.id]: phases.map((p) => p.name) }}
      values={{ ...item, ...(await fetchItemNotes(id)), phase: phases.find((p) => p.id === item.phase_id)?.name ?? null,
        assignees: item.assignees.map((a) => (a.user_id ? `u:${a.user_id}` : `s:${a.sub_org_id}`)) }} />
  )
}
