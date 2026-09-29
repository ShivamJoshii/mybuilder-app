import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Hammer } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { LogForm } from '../log-form'
import { createLog } from '../actions'

export const metadata: Metadata = { title: 'New daily log' }

export default async function NewLogPage() {
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'client' || (mode === 'builder' && !can(ctx, 'daily_logs', 'add'))) redirect('/daily-logs')
  const jobs = ctx.jobs.filter((j) => j.status !== 'closed')
  if (jobs.length === 0) return <div className="p-5"><Card><EmptyState icon={Hammer} title="No open jobs" body="Daily logs belong to a job." /></Card></div>
  const picked = selectedJobs(ctx)
  const first = picked.length === 1 ? picked[0].id : jobs[0].id
  const supabase = await createClient()
  const { data: tags } = mode === 'builder'
    ? await supabase.from('tags').select('id,name').eq('org_id', ctx.workspace.orgId).eq('module', 'daily_logs').order('name')
    : { data: [] }
  return (
    <LogForm title="New daily log" action={createLog} cancelHref="/daily-logs" mode={mode}
      jobs={[jobs.find((j) => j.id === first)!, ...jobs.filter((j) => j.id !== first)].map((j) => ({ id: j.id, title: j.title }))}
      tags={tags ?? []} canTag={mode === 'builder'} />
  )
}
