import type { Metadata } from 'next'
import { requireBuilder, can } from '@/lib/context'
import { fetchInternalUsers } from '@/lib/jobs'
import { JobForm } from '../job-form'
import { createJob } from '../actions'

export const metadata: Metadata = { title: 'New job' }

export default async function NewJobPage() {
  const ctx = await requireBuilder('jobs', 'add')
  const users = (await fetchInternalUsers(ctx.workspace.orgId)).filter((u) => u.status === 'active')
  return (
    <JobForm
      title="New job"
      action={createJob}
      cancelHref="/jobs"
      users={users}
      canSeePrice={can(ctx, 'jobs', 'price')}
      saveLabel="Create job"
    />
  )
}
