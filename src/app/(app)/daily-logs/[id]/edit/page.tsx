import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { LogForm } from '../../log-form'
import { updateLog } from '../../actions'
import type { Weather } from '@/lib/weather'

export const metadata: Metadata = { title: 'Edit daily log' }

export default async function EditLogPage({ params }: PageProps<'/daily-logs/[id]/edit'>) {
  const { id } = await params
  const ctx = await getAppContext()
  if (ctx.workspace.mode === 'client') redirect(`/daily-logs/${id}`)
  const supabase = await createClient()
  const { data: log } = await supabase.from('daily_logs').select('*').eq('id', id).maybeSingle()
  if (!log) notFound()
  if (log.created_by !== ctx.userId && !can(ctx, 'daily_logs', 'edit')) redirect(`/daily-logs/${id}`)
  const { data: tags } = ctx.workspace.mode === 'builder'
    ? await supabase.from('tags').select('id,name').eq('org_id', ctx.workspace.orgId).eq('module', 'daily_logs').order('name')
    : { data: [] }
  const job = ctx.jobs.find((j) => j.id === log.job_id)
  return (
    <LogForm title="Edit daily log" action={updateLog.bind(null, id)} cancelHref={`/daily-logs/${id}`}
      mode={ctx.workspace.mode} jobs={job ? [{ id: job.id, title: job.title }] : []} tags={tags ?? []} canTag={ctx.workspace.mode === 'builder'}
      values={{ ...log, weather: log.weather as Weather | null }} />
  )
}
