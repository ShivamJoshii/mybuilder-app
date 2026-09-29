import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireBuilder, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchInternalUsers } from '@/lib/jobs'
import { JobForm } from '../../job-form'
import { updateJob } from '../../actions'

export const metadata: Metadata = { title: 'Edit job' }

export default async function EditJobPage({ params }: PageProps<'/jobs/[id]/edit'>) {
  const { id } = await params
  const ctx = await requireBuilder('jobs', 'edit')
  const supabase = await createClient()
  const [{ data: job }, { data: priv }, { data: mgrs }, users] = await Promise.all([
    supabase.from('jobs').select('*, job_sub_notes(body)').eq('id', id).is('deleted_at', null).maybeSingle(),
    supabase.from('job_private').select('contract_price,internal_notes').eq('job_id', id).maybeSingle(),
    supabase.from('job_managers').select('user_id').eq('job_id', id),
    fetchInternalUsers(ctx.workspace.orgId),
  ])
  if (!job) notFound()
  return (
    <JobForm
      title={`Edit ${job.title}`}
      action={updateJob.bind(null, id)}
      cancelHref={`/jobs/${id}`}
      values={{ ...job, sub_notes: (job.job_sub_notes as { body: string } | null)?.body ?? null, contract_price: priv?.contract_price ?? null, internal_notes: priv?.internal_notes ?? null, managers: (mgrs ?? []).map((m) => m.user_id) }}
      users={users.filter((u) => u.status === 'active')}
      canSeePrice={can(ctx, 'jobs', 'price')}
    />
  )
}
