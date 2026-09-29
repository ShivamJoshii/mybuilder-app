import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CloudSun, NotebookPen, Plus } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchInternalUsers } from '@/lib/jobs'
import { resolveDateRange } from '@/lib/date-range'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { FilterDrawer, type FilterDef } from '@/components/kit/filter-drawer'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PrintButton } from '@/components/kit/print-button'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Daily logs' }

type Sp = Record<string, string | string[] | undefined>
const arr = (v: Sp[string]) => (v == null ? [] : Array.isArray(v) ? v : [v])
const one = (v: Sp[string]) => (Array.isArray(v) ? v[0] : v)

export default async function DailyLogsPage({ searchParams }: PageProps<'/daily-logs'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'builder' && !can(ctx, 'daily_logs')) redirect('/summary?denied=daily_logs')
  const picked = selectedJobs(ctx)
  const supabase = await createClient()

  const datePreset = one(sp.date) ?? 'past_90'
  const range = resolveDateRange(datePreset, one(sp.date_from), one(sp.date_to))
  let logs: {
    id: string; job_id: string; log_date: string; title: string | null; notes: string; status: string; tag_ids: string[]
    weather: { condition: string; high_c: number; low_c: number } | null; include_weather: boolean; author_type: string
    share_subs: boolean; share_clients: boolean; created_by: string
    profiles: { first_name: string; last_name: string; email: string } | null
  }[] = []
  if (picked.length) {
    let q = supabase.from('daily_logs')
      .select('id,job_id,log_date,title,notes,status,tag_ids,weather,include_weather,author_type,share_subs,share_clients,created_by,profiles!daily_logs_created_by_fkey(first_name,last_name,email)')
      .in('job_id', picked.map((j) => j.id)).order('log_date', { ascending: false }).order('created_at', { ascending: false }).limit(300)
    if (range.from) q = q.gte('log_date', range.from)
    if (range.to) q = q.lte('log_date', range.to)
    const kw = one(sp.q)?.trim()
    if (kw) q = q.or(`notes.ilike.%${kw.replace(/[%_,()]/g, '')}%,title.ilike.%${kw.replace(/[%_,()]/g, '')}%`)
    const by = arr(sp.created_by)
    if (by.length) {
      const ids = by.filter((b) => b !== 'internal')
      if (by.includes('internal')) q = q.eq('author_type', 'internal')
      else if (ids.length) q = q.in('created_by', ids)
    }
    const tags = arr(sp.tags); if (tags.length) q = q.overlaps('tag_ids', tags)
    const { data } = await q
    logs = (data ?? []) as unknown as typeof logs
  }

  const { data: tagRows } = mode === 'builder'
    ? await supabase.from('tags').select('id,name').eq('org_id', ctx.workspace.orgId).eq('module', 'daily_logs').order('name')
    : { data: [] as { id: string; name: string }[] }
  const tagName = new Map((tagRows ?? []).map((t) => [t.id, t.name]))
  const users = mode === 'builder' ? await fetchInternalUsers(ctx.workspace.orgId) : []

  const filters: FilterDef[] = [
    { type: 'text', name: 'q', label: 'Keywords' },
    ...(mode === 'builder' ? [{ type: 'multi' as const, name: 'created_by', label: 'Created by', options: [{ value: 'internal', label: 'All internal users' }, ...users.map((u) => ({ value: u.user_id, label: u.name }))] }] : []),
    { type: 'date', name: 'date', label: 'Date' },
    ...((tagRows ?? []).length ? [{ type: 'multi' as const, name: 'tags', label: 'Tags', options: (tagRows ?? []).map((t) => ({ value: t.id, label: t.name })) }] : []),
  ]
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  const canCreate = mode === 'sub' || (mode === 'builder' && can(ctx, 'daily_logs', 'add'))

  return (
    <>
      <PageHeader title="Daily logs" jobName={selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length)} actions={<>
        <PrintButton />
        <FilterDrawer filters={filters} />
        {canCreate && <Button asChild variant="primary"><Link href="/daily-logs/new"><Plus />Create new daily log</Link></Button>}
      </>}>
        {!sp.date && <p className="mt-2 text-xs text-text-3">Showing the past 90 days.</p>}
      </PageHeader>
      {picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="space-y-3 p-5">
        {logs.length === 0 ? (
          <Card><EmptyState icon={NotebookPen} title="No daily logs" body="Record what happened on site each day: work done, deliveries, weather and photos." /></Card>
        ) : logs.map((l) => (
          <Card key={l.id} className="break-inside-avoid">
            <Link href={`/daily-logs/${l.id}`} className="block px-4 py-3 hover:bg-surface-2/60">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-semibold">{formatDate(l.log_date)}</span>
                <span className="text-text-3">{jobName.get(l.job_id)}</span>
                {l.title && <span className="font-medium">· {l.title}</span>}
                {l.status === 'draft' && <Badge tone="warning">Draft</Badge>}
                {l.author_type === 'sub' && <Badge>Sub/vendor</Badge>}
                <span className="ml-auto text-xs text-text-3">
                  {l.profiles ? `${l.profiles.first_name} ${l.profiles.last_name}`.trim() : ''}
                </span>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] text-text-2">{l.notes}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {l.include_weather && l.weather && (
                  <span className="flex items-center gap-1 text-xs text-text-3"><CloudSun className="size-3.5" />{l.weather.condition}, {l.weather.high_c}° / {l.weather.low_c}°C</span>
                )}
                {l.tag_ids.map((t) => tagName.get(t) && <Badge key={t} tone="brand">{tagName.get(t)}</Badge>)}
                {mode === 'builder' && l.share_subs && <Badge>Shared with subs</Badge>}
                {mode === 'builder' && l.share_clients && <Badge>Shared with client</Badge>}
              </div>
            </Link>
          </Card>
        ))}
      </div>
    </>
  )
}
