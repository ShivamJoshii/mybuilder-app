import { todayIn } from '@/lib/utils'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, CloudOff, Plus, Radio, Trash2 } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchCalendar, fetchSchedule } from '@/lib/schedule/data'
import { criticalPath } from '@/lib/schedule/calendar'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { FilterDrawer, type FilterDef } from '@/components/kit/filter-drawer'
import { PrintButton } from '@/components/kit/print-button'
import { ActionForm } from '@/components/kit/action-form'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Field, Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, formatDate } from '@/lib/utils'
import { CalendarView, GanttView, ListView, type ViewItem } from './views'
import { setOnline, captureBaseline, addException, deleteException } from './actions'

export const metadata: Metadata = { title: 'Schedule' }

type Sp = Record<string, string | string[] | undefined>
const one = (v: Sp[string]) => (Array.isArray(v) ? v[0] : v)

export default async function SchedulePage({ searchParams }: PageProps<'/schedule'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'builder' && !can(ctx, 'schedule')) redirect('/summary?denied=schedule')
  if (typeof sp.item === 'string') redirect(`/schedule/${sp.item}`)
  const tab = one(sp.tab) === 'exceptions' ? 'exceptions' : 'schedule'
  const view = (['calendar', 'list', 'gantt'] as const).find((v) => v === one(sp.view)) ?? 'calendar'
  const picked = selectedJobs(ctx)
  const today = todayIn()
  const editor = mode === 'builder' && can(ctx, 'schedule', 'edit')

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : [])))
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k) }
    return `/schedule?${p}`
  }
  const tabs = (
    <div className="mt-3 flex gap-4 text-[13px]" role="tablist">
      {[['schedule', 'Schedule'], ['exceptions', 'Workday exceptions']].map(([k, l]) => (
        <Link key={k} href={qs({ tab: k === 'schedule' ? undefined : k })} role="tab" aria-selected={tab === k}
          className={cn('-mb-3 border-b-2 pb-2 font-medium', tab === k ? 'border-brand text-brand' : 'border-transparent text-text-3 hover:text-text')}>{l}</Link>
      ))}
    </div>
  )

  if (tab === 'exceptions') {
    const orgId = mode === 'builder' ? ctx.workspace.orgId : null
    const supabase = await createClient()
    const { data: ex } = await supabase.from('workday_exceptions').select('*').order('start_date')
    const rows = (ex ?? []).filter((e) => !orgId || e.org_id === orgId)
    return (
      <>
        <PageHeader title="Schedule" jobName={selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length)} actions={<PrintButton />}>{tabs}</PageHeader>
        <div className="grid gap-5 p-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            {rows.length === 0 ? <EmptyState icon={CalendarDays} title="No workday exceptions" body="Add statutory holidays, shutdowns or extra Saturdays so durations count the right days." /> : (
              <table className="w-full text-[13px]">
                <thead className="bg-surface-2 text-left text-xs font-semibold text-text-2"><tr><th className="px-3 py-2">Title</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Dates</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Applies to</th><th /></tr></thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{e.title}</td>
                      <td className="px-3 py-2"><Badge tone={e.type === 'non_workday' ? 'warning' : 'success'}>{e.type === 'non_workday' ? 'Non workday' : 'Extra workday'}</Badge></td>
                      <td className="px-3 py-2">{formatDate(e.start_date)}{e.end_date !== e.start_date ? ` – ${formatDate(e.end_date)}` : ''}{e.repeat_annually ? ' · yearly' : ''}</td>
                      <td className="px-3 py-2">{e.category}</td>
                      <td className="px-3 py-2">{e.job_id ? ctx.jobs.find((j) => j.id === e.job_id)?.title : 'All jobs'}</td>
                      <td className="px-3 py-1 text-right">{editor && <form action={deleteException.bind(null, e.id)}><Button type="submit" size="icon" variant="ghost" aria-label={`Delete ${e.title}`}><Trash2 /></Button></form>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          {editor && (
            <Card>
              <CardHeader title="Add an exception" />
              <ActionForm action={addException} className="space-y-3 p-4">
                <Field label="Title" htmlFor="ex_title" required><Input id="ex_title" name="title" placeholder="e.g. Thanksgiving" required /></Field>
                <Field label="Type" htmlFor="ex_type"><Select id="ex_type" name="type"><option value="non_workday">Non workday</option><option value="extra_workday">Extra workday</option></Select></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Start" htmlFor="ex_start" required><Input id="ex_start" name="start_date" type="date" required /></Field>
                  <Field label="End" htmlFor="ex_end"><Input id="ex_end" name="end_date" type="date" /></Field>
                </div>
                <Field label="Category" htmlFor="ex_cat"><Select id="ex_cat" name="category"><option value="Statutory holiday">Statutory holiday</option><option value="Company shutdown">Company shutdown</option><option value="Weekend work">Weekend work</option><option value="Weather">Weather</option></Select></Field>
                <Field label="Applies to" htmlFor="ex_job"><Select id="ex_job" name="job_id"><option value="">All jobs</option>{ctx.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</Select></Field>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="repeat_annually" className="accent-brand" />Repeats every year</label>
                <Button type="submit" variant="primary">Add</Button>
              </ActionForm>
            </Card>
          )}
        </div>
      </>
    )
  }

  const { items, links, online, phases } = await fetchSchedule(picked.map((j) => j.id))
  const jobTitle = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  const jobColor = new Map(ctx.jobs.map((j) => [j.id, j.color]))
  const phaseName = new Map(phases.map((p) => [p.id, p.name]))
  const myOrgs = new Set(ctx.orgs.map((o) => o.org_id))

  // Critical path per job + latest baseline (single job)
  const critical = new Set<string>()
  let baseline = new Map<string, { start_date: string; end_date: string }>()
  if (mode === 'builder') {
    for (const j of picked) {
      const its = items.filter((i) => i.job_id === j.id)
      if (its.length) for (const id of criticalPath(its, links, await fetchCalendar(j.id))) critical.add(id)
    }
    if (picked.length === 1) {
      const supabase = await createClient()
      const { data: b } = await supabase.from('schedule_baselines').select('items,captured_at').eq('job_id', picked[0].id).order('captured_at', { ascending: false }).limit(1).maybeSingle()
      if (b) baseline = new Map((b.items as { id: string; start_date: string; end_date: string }[]).map((x) => [x.id, x]))
    }
  }

  const assigned = one(sp.assigned)
  const status = one(sp.status)
  const viewItems: ViewItem[] = items
    .filter((i) => view !== 'gantt' || i.show_on_gantt)
    .filter((i) => assigned !== 'me' || i.assignees.some((a) => a.user_id === ctx.userId || (a.sub_org_id && myOrgs.has(a.sub_org_id))))
    .filter((i) => {
      if (!status) return true
      const done = Boolean(i.completed_at)
      if (status === 'completed') return done
      if (status === 'upcoming') return !done && i.start_date > today
      if (status === 'in_progress') return !done && i.start_date <= today && i.end_date >= today
      if (status === 'past_due') return !done && i.end_date < today
      if (status === 'incomplete') return !done
      if (status === 'unconfirmed') return i.assignees.some((a) => a.sub_org_id && a.status !== 'confirmed')
      return true
    })
    .map((i) => ({
      id: i.id, title: i.title, job_id: i.job_id, job_title: jobTitle.get(i.job_id) ?? '', color: i.color ?? jobColor.get(i.job_id) ?? '#4F7CAC',
      start_date: i.start_date, end_date: i.end_date, duration: i.duration, progress: i.progress, completed: Boolean(i.completed_at),
      assignees: i.assignees.map((a) => ({ label: a.label, status: a.status })), critical: critical.has(i.id),
      baseline_start: baseline.get(i.id)?.start_date ?? null, baseline_end: baseline.get(i.id)?.end_date ?? null,
      phase: i.phase_id ? phaseName.get(i.phase_id) ?? null : null,
    }))

  const filters: FilterDef[] = [
    { type: 'select', name: 'assigned', label: 'Assigned to', options: [{ value: 'me', label: 'Assigned to me' }] },
    { type: 'select', name: 'status', label: 'Status', options: [
      { value: 'upcoming', label: 'Upcoming' }, { value: 'completed', label: 'Completed' }, { value: 'in_progress', label: 'In progress' },
      { value: 'incomplete', label: 'Incomplete' }, { value: 'past_due', label: 'Past due' }, { value: 'unconfirmed', label: 'Unconfirmed' }] },
  ]
  const single = picked.length === 1 ? picked[0] : null
  const isOnline = single ? Boolean(online.get(single.id)) : false
  const offlineForPortal = mode !== 'builder' && picked.length > 0 && picked.every((j) => !online.get(j.id))

  return (
    <>
      <PageHeader title="Schedule" jobName={selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length)} actions={<>
        <div className="flex rounded-md border border-border-strong" role="group" aria-label="View">
          {(['calendar', 'list', 'gantt'] as const).map((v) => (
            <Link key={v} href={qs({ view: v })} aria-current={view === v ? 'page' : undefined}
              className={cn('px-3 py-1.5 text-[13px] capitalize first:rounded-l-md last:rounded-r-md', view === v ? 'bg-brand text-white' : 'hover:bg-surface-2')}>{v}</Link>
          ))}
        </div>
        <FilterDrawer filters={filters} />
        <PrintButton />
        {mode === 'builder' && can(ctx, 'schedule', 'add') && <Button asChild variant="primary"><Link href="/schedule/new"><Plus />New item</Link></Button>}
      </>}>{tabs}</PageHeader>
      {picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="space-y-4 p-5">
        {mode === 'builder' && single && (
          <div className={cn('flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-[13px]', isOnline ? 'border-success/30 bg-success-soft' : 'border-warning/30 bg-warning-soft')}>
            {isOnline ? <Radio className="size-4 text-success" /> : <CloudOff className="size-4 text-warning" />}
            <span className="flex-1">
              {isOnline ? <><strong>Online.</strong> Subs and clients see what you share; assignees get notified and date changes are logged.</>
                : <><strong>Offline.</strong> Build the schedule privately. Nobody is notified until you go online.</>}
            </span>
            {editor && <>
              <form action={captureBaseline.bind(null, single.id)}><Button type="submit" size="sm">{baseline.size ? 'Re-capture baseline' : 'Capture baseline'}</Button></form>
              <form action={setOnline.bind(null, single.id, !isOnline)}><Button type="submit" size="sm" variant={isOnline ? 'secondary' : 'primary'}>{isOnline ? 'Take offline' : 'Go online'}</Button></form>
            </>}
          </div>
        )}
        {offlineForPortal ? (
          <Card><EmptyState icon={CloudOff} title="This calendar is offline" body="Your builder has not shared schedule items with you yet." /></Card>
        ) : viewItems.length === 0 && picked.length > 0 ? (
          <Card><EmptyState icon={CalendarDays} title="No schedule items" body={mode === 'builder' ? 'Add items with durations and link them so the schedule moves itself when dates change.' : 'Nothing is scheduled for you yet.'}
            action={mode === 'builder' && can(ctx, 'schedule', 'add') ? <Button asChild variant="primary"><Link href="/schedule/new"><Plus />New item</Link></Button> : undefined} /></Card>
        ) : picked.length > 0 && (
          view === 'calendar' ? <CalendarView items={viewItems} today={today} />
          : view === 'list' ? <ListView items={viewItems} today={today} />
          : <>
              {mode === 'builder' && <Alert tone="info">Bars outlined in red are on the critical path{baseline.size ? '; dashed lines show the captured baseline' : ''}.</Alert>}
              <GanttView items={viewItems} links={links.map((l) => ({ from: l.predecessor_id, to: l.successor_id, type: l.type }))} today={today} showBaseline={baseline.size > 0} />
            </>
        )}
      </div>
    </>
  )
}
