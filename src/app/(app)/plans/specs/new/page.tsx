import type { Metadata } from 'next'
import { requireBuilder, selectedJobs } from '@/lib/context'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { SpecForm } from '../spec-form'
import { createSpec } from '../../actions'

export const metadata: Metadata = { title: 'New specification' }

export default async function NewSpecPage() {
  const ctx = await requireBuilder('specs', 'add')
  const picked = selectedJobs(ctx)
  return (
    <>
      <PageHeader title="New specification" />
      <div className="mx-auto max-w-3xl p-5">
        <Card className="p-5">
          <SpecForm action={createSpec} jobs={ctx.jobs} submitLabel="Create specification"
            defaults={{ job_id: picked.length === 1 ? picked[0].id : '', division: '', title: '', body: '', share_subs: false, share_clients: false }} />
        </Card>
      </div>
    </>
  )
}
