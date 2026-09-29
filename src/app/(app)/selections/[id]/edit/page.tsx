import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { requireBuilder } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { SelectionForm } from '../../selection-form'
import { updateSelection } from '../../actions'

export const metadata: Metadata = { title: 'Edit selection' }

export default async function EditSelectionPage({ params }: PageProps<'/selections/[id]/edit'>) {
  const { id } = await params
  const ctx = await requireBuilder('selections', 'edit')
  const supabase = await createClient()
  const { data: s } = await supabase.from('selections').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!s) notFound()
  if (s.status === 'approved') redirect(`/selections/${id}`)
  const job = ctx.jobs.find((j) => j.id === s.job_id)
  const { data: items } = await supabase.from('schedule_items').select('id,job_id,title,start_date').eq('job_id', s.job_id).is('deleted_at', null).order('start_date')
  return (
    <>
      <PageHeader title="Edit selection" jobName={job?.title} />
      <div className="mx-auto max-w-3xl p-5">
        <Card className="p-5">
          <SelectionForm action={updateSelection.bind(null, id)} jobs={job ? [job] : []} scheduleItems={items ?? []} submitLabel="Save selection"
            defaults={{ job_id: s.job_id, title: s.title, category: s.category ?? '', location: s.location ?? '', instructions: s.instructions ?? '',
              allowance: s.allowance != null ? String(s.allowance) : '', deadline: s.schedule_item_id ? '' : s.deadline ?? '', schedule_item_id: s.schedule_item_id ?? '',
              days_before: s.days_before ?? 7, share_client: s.share_client, share_subs: s.share_subs }} />
        </Card>
      </div>
    </>
  )
}
