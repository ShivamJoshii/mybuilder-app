import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { getAppContext, selectedJobs, can } from '@/lib/context'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { FilterDrawer, type FilterDef } from '@/components/kit/filter-drawer'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { timeAgo } from '@/components/kit/comments'
import { resolveDateRange } from '@/lib/date-range'
import { RECORD_TYPES, recordHref, recordLabel } from '@/lib/records'
import { cn, initials } from '@/lib/utils'

export const metadata: Metadata = { title: 'Comments' }

type Sp = Record<string, string | string[] | undefined>
const arr = (v: Sp[string]) => (v == null ? [] : Array.isArray(v) ? v : [v])
const one = (v: Sp[string]) => (Array.isArray(v) ? v[0] : v)

export default async function CommentsPage({ searchParams }: PageProps<'/comments'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  if (ctx.workspace.mode === 'builder' && !can(ctx, 'messages')) redirect('/summary?denied=messages')
  const picked = selectedJobs(ctx)
  const tab = one(sp.tab) === 'comments' ? 'comments' : 'conversations'
  const jobIds = picked.map((j) => j.id)
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))

  let rows: {
    id: string; body: string; job_id: string; record_type: string; record_id: string; author_type: string
    created_at: string; profiles: { first_name: string; last_name: string; email: string } | null
  }[] = []
  if (jobIds.length) {
    const supabase = await createClient()
    let q = supabase.from('comments')
      .select('id,body,job_id,record_type,record_id,author_type,created_at,profiles(first_name,last_name,email)')
      .in('job_id', jobIds).order('created_at', { ascending: false }).limit(500)
    const kw = one(sp.q)?.trim()
    if (kw) q = q.ilike('body', `%${kw.replace(/[%_]/g, '')}%`)
    const types = arr(sp.type); if (types.length) q = q.in('record_type', types)
    const users = arr(sp.user_type); if (users.length) q = q.in('author_type', users)
    const r = resolveDateRange(one(sp.date), one(sp.date_from), one(sp.date_to))
    if (r.from) q = q.gte('created_at', r.from)
    if (r.to) q = q.lt('created_at', new Date(new Date(r.to).getTime() + 86400000).toISOString())
    const { data } = await q
    rows = (data ?? []) as typeof rows
  }

  const filters: FilterDef[] = [
    { type: 'text', name: 'q', label: 'Keywords' },
    { type: 'multi', name: 'type', label: 'Type', options: Object.entries(RECORD_TYPES).map(([value, v]) => ({ value, label: v.label })) },
    { type: 'multi', name: 'user_type', label: 'User type', options: [
      { value: 'internal', label: 'Users' }, { value: 'client', label: 'Clients' }, { value: 'sub', label: 'Subs/vendors' }] },
    { type: 'date', name: 'date', label: 'Date' },
  ]

  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const k = `${r.record_type}:${r.record_id}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }

  const tabHref = (t: string) => {
    const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => arr(v).map((x) => [k, x])))
    p.set('tab', t)
    return `/comments?${p}`
  }
  const label = selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length)
  const who = (r: (typeof rows)[number]) => (r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}`.trim() || r.profiles.email : 'Someone')

  return (
    <>
      <PageHeader title="Comments" jobName={label} actions={<FilterDrawer filters={filters} />}>
        <div className="mt-3 flex gap-4 text-[13px]" role="tablist">
          {[['conversations', 'Conversations'], ['comments', 'Comments']].map(([k, l]) => (
            <Link key={k} href={tabHref(k)} role="tab" aria-selected={tab === k}
              className={cn('-mb-3 border-b-2 pb-2 font-medium', tab === k ? 'border-brand text-brand' : 'border-transparent text-text-3 hover:text-text')}>{l}</Link>
          ))}
        </div>
      </PageHeader>
      {picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="p-5">
        <Card>
          {rows.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No comments yet" body="Comments on jobs, logs, files and change orders show up here in one place." />
          ) : tab === 'conversations' ? (
            <ul className="divide-y divide-border">
              {[...groups.entries()].map(([k, list]) => {
                const first = list[0]
                return (
                  <li key={k} className="px-4 py-3">
                    <div className="flex items-center gap-2 text-[13px]">
                      <Badge>{recordLabel(first.record_type)}</Badge>
                      <Link href={recordHref(first.record_type, first.job_id, first.record_id)} className="font-medium text-brand hover:underline">
                        {first.record_type === 'job' ? jobName.get(first.job_id) : `${recordLabel(first.record_type)} on ${jobName.get(first.job_id)}`}
                      </Link>
                      <span className="ml-auto text-xs text-text-3">{list.length} {list.length === 1 ? 'comment' : 'comments'} · {timeAgo(first.created_at)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] text-text-2"><span className="font-medium text-text">{who(first)}:</span> {first.body}</p>
                  </li>
                )
              })}
            </ul>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="flex gap-3 px-4 py-3">
                  <Avatar text={initials(r.profiles)} />
                  <div className="min-w-0 flex-1 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{who(r)}</span>
                      <span className="text-xs text-text-3">on</span>
                      <Link href={recordHref(r.record_type, r.job_id, r.record_id)} className="text-brand hover:underline">{recordLabel(r.record_type)} · {jobName.get(r.job_id)}</Link>
                      <span className="ml-auto text-xs text-text-3">{timeAgo(r.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{r.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
