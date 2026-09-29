import type { Metadata } from 'next'
import { requireBuilder, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { SelectionForm } from '../selection-form'
import { createSelection } from '../actions'
import { forJobs } from '@/lib/job-filter'

export const metadata: Metadata = { title: 'New selection' }

export default async function NewSelectionPage() {
  const ctx = await requireBuilder('selections', 'add')
  const picked = selectedJobs(ctx)
  const supabase = await createClient()
  const { data: items } = ctx.jobs.length
    ? await forJobs(supabase.from('schedule_items').select('id,job_id,title,start_date'), ctx, ctx.jobs.map((j) => j.id)).is('deleted_at', null).order('start_date')
    : { data: [] }
  return (
    <>
      <PageHeader title="New selection" />
      <div className="mx-auto max-w-3xl p-5">
        <Card className="p-5">
          <SelectionForm action={createSelection} jobs={ctx.jobs} scheduleItems={items ?? []} submitLabel="Create selection"
            defaults={{ job_id: picked.length === 1 ? picked[0].id : '', title: '', category: '', location: '', instructions: '', allowance: '', deadline: '', schedule_item_id: '', days_before: 7, share_client: true, share_subs: false }} />
        </Card>
      </div>
    </>
  )
}
