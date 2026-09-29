import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { forJobs } from '@/lib/job-filter'
import { getAppContext } from '@/lib/context'

export type LinkTarget = { type: string; id: string; job_id: string; label: string }

/** Records on these jobs that can be linked as related items (visible to the caller). */
export async function linkableRecords(jobIds: string[]): Promise<LinkTarget[]> {
  const ctx = await getAppContext()
  if (jobIds.length === 0) return []
  const supabase = await createClient()
  const [{ data: todos }, { data: logs }, { data: rfis }] = await Promise.all([
    forJobs(supabase.from('todos').select('id,job_id,title'), ctx, jobIds).is('deleted_at', null).limit(300),
    forJobs(supabase.from('daily_logs').select('id,job_id,log_date,title'), ctx, jobIds).is('deleted_at', null).order('log_date', { ascending: false }).limit(300),
    forJobs(supabase.from('rfis').select('id,job_id,number,title'), ctx, jobIds).is('deleted_at', null).limit(300),
  ])
  return [
    ...(todos ?? []).map((t) => ({ type: 'todo', id: t.id, job_id: t.job_id, label: t.title })),
    ...(logs ?? []).map((l) => ({ type: 'daily_log', id: l.id, job_id: l.job_id, label: `${formatDate(l.log_date)}${l.title ? ` · ${l.title}` : ''}` })),
    ...(rfis ?? []).map((r) => ({ type: 'rfi', id: r.id, job_id: r.job_id, label: `RFI #${r.number} · ${r.title}` })),
  ]
}

/** Labels for linked records (only ones the caller can see come back). */
export async function describeLinks(links: { to_type: string; to_id: string }[]) {
  const supabase = await createClient()
  const ids = (t: string) => links.filter((l) => l.to_type === t).map((l) => l.to_id)
  const out = new Map<string, string>()
  const [a, b, c] = await Promise.all([
    ids('todo').length ? supabase.from('todos').select('id,title').in('id', ids('todo')) : { data: [] },
    ids('daily_log').length ? supabase.from('daily_logs').select('id,log_date,title').in('id', ids('daily_log')) : { data: [] },
    ids('rfi').length ? supabase.from('rfis').select('id,number,title').in('id', ids('rfi')) : { data: [] },
  ])
  for (const t of (a.data ?? []) as { id: string; title: string }[]) out.set(t.id, t.title)
  for (const l of (b.data ?? []) as { id: string; log_date: string; title: string | null }[]) out.set(l.id, `${formatDate(l.log_date)}${l.title ? ` · ${l.title}` : ''}`)
  for (const r of (c.data ?? []) as { id: string; number: number; title: string }[]) out.set(r.id, `RFI #${r.number} · ${r.title}`)
  return out
}
