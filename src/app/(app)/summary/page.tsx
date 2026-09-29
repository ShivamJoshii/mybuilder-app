import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Hammer, MousePointerClick, Plus } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { navFor } from '@/lib/modules'
import { PageHeader, selectionLabel } from '@/components/shell/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { JobStatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Alert } from '@/components/ui/alert'
import { cn, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'
import { jobMoney, summaryWidgets, type Widget } from '@/lib/summary'

export const metadata: Metadata = { title: 'Summary' }

export default async function SummaryPage({ searchParams }: PageProps<'/summary'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  const picked = selectedJobs(ctx)
  const label = selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length)
  const denied = typeof sp.denied === 'string'

  const widgets = await summaryWidgets(ctx, picked.map((j) => j.id))
  const supabase = await createClient()
  const { data: logs } = picked.length ? await supabase.from('daily_logs').select('id,title,notes,log_date,job_id').in('job_id', picked.map((j) => j.id)).eq('status', 'published').order('log_date', { ascending: false }).limit(5) : { data: [] }
  const money = mode === 'builder' && picked.length === 1 && can(ctx, 'budget') && can(ctx, 'budget', 'cost') ? await jobMoney(picked[0].id) : null
  const shortcuts = navFor(mode)
    .filter((g) => g.label !== 'Jobs')
    .flatMap((g) => g.items)
    .filter((i) => mode !== 'builder' || !i.module || can(ctx, i.module))
    .slice(0, 24)

  return (
    <>
      <PageHeader title="Summary" jobName={label} jobHref={picked.length === 1 ? `/jobs/${picked[0].id}` : undefined} />
      <div className="space-y-5 p-5">
        {denied && <Alert>You don’t have access to that page. Contact an administrator if you need it.</Alert>}

        {ctx.jobs.length === 0 ? (
          <Card>
            <EmptyState
              icon={Hammer}
              title={mode === 'builder' && can(ctx, 'jobs', 'add') ? 'Create your first job' : 'No jobs yet'}
              body={mode === 'builder' && can(ctx, 'jobs', 'add')
                ? 'Add a job to start tracking its schedule, files, subs, clients and money.'
                : mode === 'builder' ? 'Jobs appear here when an admin gives you access.'
                : 'When a builder adds you to a job, it shows up here.'}
              action={mode === 'builder' && can(ctx, 'jobs', 'add')
                ? <Button asChild variant="primary"><Link href="/jobs/new"><Plus />New job</Link></Button>
                : undefined}
            />
          </Card>
        ) : picked.length === 0 ? (
          <Card>
            <EmptyState icon={MousePointerClick} title="Select a job to view your summary" body="Pick a job from the list on the left, or choose all jobs." />
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
            {money && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[['Contract', money.contract], ['Revised budget', money.budget], ['Committed', money.committed], ['Actual cost', money.actual]].map(([l, v]) => (
                  <Link key={l} href={`/budget?job=${picked[0].id}`}><Card className="p-3 hover:border-brand/40"><div className="text-xs text-text-3">{l}</div><div className="text-lg font-semibold tabular-nums">{v}</div></Card></Link>
                ))}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {widgets.map((w) => <WidgetCard key={w.key} w={w} />)}
            </div>
            <Card>
              <CardHeader title={picked.length === 1 ? 'Job' : `${picked.length} jobs`} />
              <ul className="divide-y divide-border">
                {picked.slice(0, 25).map((j) => (
                  <li key={j.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className="size-2.5 rounded-full" style={{ background: j.color }} />
                    <Link href={`/jobs/${j.id}`} className="min-w-0 flex-1 truncate font-medium text-brand hover:underline">{j.title}</Link>
                    {mode === 'sub' && <span className="text-text-3">{j.builder_name}</span>}
                    <span className="hidden text-text-3 sm:inline">{[j.street, j.city].filter(Boolean).join(', ')}</span>
                    <span className="hidden text-text-3 md:inline">{formatDate(j.projected_start)}</span>
                    <JobStatusBadge status={j.status} />
                  </li>
                ))}
              </ul>
            </Card>
            </div>
            <div className="space-y-5">
            {(logs ?? []).length > 0 && (
              <Card>
                <CardHeader title="Latest daily logs" />
                <ul className="divide-y divide-border">
                  {(logs ?? []).map((l) => (
                    <li key={l.id} className="px-4 py-2 text-[13px]">
                      <Link href={`/daily-logs/${l.id}`} className="font-medium text-brand hover:underline">{l.title || formatDate(l.log_date)}</Link>
                      <div className="text-xs text-text-3">{formatDate(l.log_date)}{picked.length > 1 ? ` · ${ctx.jobs.find((j) => j.id === l.job_id)?.title ?? ''}` : ''}</div>
                      <p className="line-clamp-2 text-text-2">{l.notes}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Card>
              <CardHeader title="Go to" />
              <ul className="p-2">
                {shortcuts.map((s) => (
                  <li key={s.href}>
                    <Link href={s.href} className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-surface-2">
                      <s.icon className="size-4 text-text-3" />
                      <span className="flex-1">{s.label}</span>
                      <ArrowRight className="size-3.5 text-text-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const FLAG = { overdue: 'text-danger', today: 'text-brand', soon: 'text-warning' } as const

function WidgetCard({ w }: { w: Widget }) {
  return (
    <Card data-widget={w.key}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold">{w.title}{w.total > 0 && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs font-medium text-text-2">{w.total}</span>}</h2>
        <Link href={w.href} className="text-xs text-brand hover:underline">View all</Link>
      </div>
      {w.items.length === 0 ? <p className="px-4 py-3 text-[13px] text-text-3">{w.empty}</p> : (
        <ul className="divide-y divide-border">
          {w.items.map((i) => (
            <li key={i.id} className="px-4 py-2 text-[13px]">
              <Link href={i.href} className="font-medium hover:text-brand hover:underline">{i.label}</Link>
              {i.sub && <div className={cn('text-xs text-text-3', i.flag && FLAG[i.flag])}>{i.flag === 'overdue' ? 'Overdue · ' : ''}{i.sub}</div>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
