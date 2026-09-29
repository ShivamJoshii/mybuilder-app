import type { Metadata } from 'next'
import { requireBuilder, selectedJobs } from '@/lib/context'
import { PageHeader } from '@/components/shell/page-header'
import { PlanSetUploader } from './plan-set-uploader'

export const metadata: Metadata = { title: 'Upload plans' }

export default async function UploadPlansPage() {
  const ctx = await requireBuilder('specs', 'add')
  const picked = selectedJobs(ctx)
  return (
    <>
      <PageHeader title="Upload plans" />
      <div className="mx-auto max-w-4xl p-5">
        <PlanSetUploader jobs={ctx.jobs.map(({ id, title }) => ({ id, title }))} defaultJob={picked.length === 1 ? picked[0].id : ''} />
      </div>
    </>
  )
}
