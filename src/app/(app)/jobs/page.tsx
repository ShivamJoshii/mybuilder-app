import type { Metadata } from 'next'
import Link from 'next/link'
import { Hammer, MapPin, Plus } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { fetchJobs, queryJobs, fetchInternalUsers, type JobRow } from '@/lib/jobs'
import { PageHeader } from '@/components/shell/page-header'
import { FilterDrawer, type FilterDef } from '@/components/kit/filter-drawer'
import { SavedViews } from '@/components/kit/saved-views'
import { fetchViews } from '@/lib/views'
import { redirect } from 'next/navigation'
import { DataTable, type Column } from '@/components/kit/data-table'
import { Button } from '@/components/ui/button'
import { JobStatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { JOB_STATUSES, cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Jobs' }

export default async function JobsPage({ searchParams }: PageProps<'/jobs'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const isBuilder = ctx.workspace.mode === 'builder'
  const isSub = ctx.workspace.mode === 'sub'
  const views = await fetchViews(ctx, 'jobs')
  // Open the user's default view when they land on the bare list
  const def = views.find((v) => v.is_default)
  if (def && Object.keys(sp).length === 0 && def.query) redirect(`/jobs?${def.query}`)
  const all = await fetchJobs(ctx)
  const result = queryJobs(all, sp)
  const view = sp.view === 'map' ? 'map' : 'list'

  const pmOptions = ctx.workspace.mode === 'builder'
    ? [{ value: 'unassigned', label: 'Unassigned' },
       ...(await fetchInternalUsers(ctx.workspace.orgId)).map((u) => ({ value: u.user_id, label: u.name }))]
    : [{ value: 'unassigned', label: 'Unassigned' },
       ...[...new Map(all.flatMap((j) => j.managers).map((m) => [m.user_id, m.name])).entries()].map(([value, label]) => ({ value, label }))]

  const filters: FilterDef[] = [
    { type: 'text', name: 'q', label: 'Keywords', placeholder: 'Name, address, permit, lot' },
    { type: 'multi', name: 'pm', label: 'Project managers', options: pmOptions },
    { type: 'multi', name: 'status', label: 'Status', options: JOB_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { type: 'date', name: 'created', label: 'Created date' },
  ]
  if (isSub) {
    filters.push({ type: 'multi', name: 'builder', label: 'Builder',
      options: ctx.buildersAsSub.map((b) => ({ value: b.builder_org_id, label: b.builder_name })) })
  }

  const columns: Column<JobRow>[] = [
    { key: 'title', label: 'Job name', sortable: true, render: (j) => (
      <Link href={`/jobs/${j.id}`} className="flex items-center gap-2 font-medium text-brand hover:underline">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: j.color }} />{j.title}
      </Link>) },
    { key: 'street', label: 'Street address', sortable: true, render: (j) => j.street },
    { key: 'city', label: 'City', sortable: true, render: (j) => j.city },
    { key: 'province', label: 'Prov', sortable: true, className: 'whitespace-nowrap', render: (j) => j.province },
    { key: 'postal_code', label: 'Postal', sortable: true, className: 'whitespace-nowrap', render: (j) => j.postal_code },
    ...(isSub ? [{ key: 'builder', label: 'Builder', sortable: true, render: (j: JobRow) => j.builder_name }] : []),
    { key: 'pm', label: 'Project manager', sortable: true, render: (j) => j.managers.map((m) => m.name).join(', ') || <span className="text-text-3">Unassigned</span> },
    { key: 'status', label: 'Job status', sortable: true, render: (j) => <JobStatusBadge status={j.status} /> },
    { key: 'permit', label: 'Permit', sortable: true, className: 'whitespace-nowrap', render: (j) => j.permit_number },
    { key: 'notes', label: 'Job notes', className: 'max-w-64', render: (j) => <span className="line-clamp-2 text-text-2">{j.sub_notes}</span> },
    { key: 'lot', label: 'Lot', sortable: true, render: (j) => j.lot_info },
  ]

  const tabHref = (v: string) => {
    const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v2]) => (Array.isArray(v2) ? v2.map((x) => [k, x]) : v2 ? [[k, v2]] : [])))
    if (v === 'map') p.set('view', 'map'); else p.delete('view')
    return `/jobs?${p.toString()}`
  }

  return (
    <>
      <PageHeader
        title={sp.templates === '1' ? 'Job templates' : 'Jobs'}
        actions={<>
          <SavedViews module="jobs" views={views} canShare={isBuilder} />
          <FilterDrawer filters={filters} />
          {isBuilder && can(ctx, 'jobs', 'add') && (
            <Button asChild variant="primary"><Link href="/jobs/new"><Plus />New job</Link></Button>
          )}
        </>}
      >
        <div className="mt-3 flex gap-4 text-[13px]" role="tablist">
          {sp.templates !== '1' && (['list', 'map'] as const).map((v) => (
            <Link key={v} href={tabHref(v)} role="tab" aria-selected={view === v}
              className={cn('-mb-3 border-b-2 pb-2 font-medium capitalize', view === v ? 'border-brand text-brand' : 'border-transparent text-text-3 hover:text-text')}>
              {v}
            </Link>
          ))}
          {isBuilder && (
            <Link href={sp.templates === '1' ? '/jobs' : '/jobs?templates=1'} role="tab" aria-selected={sp.templates === '1'}
              className={cn('-mb-3 border-b-2 pb-2 font-medium', sp.templates === '1' ? 'border-brand text-brand' : 'border-transparent text-text-3 hover:text-text')}>
              {sp.templates === '1' ? 'Back to jobs' : 'Templates'}
            </Link>
          )}
        </div>
      </PageHeader>
      <div className="p-5">
        {view === 'list' ? (
          <DataTable
            rows={result.rows}
            columns={columns}
            total={result.total}
            page={result.page}
            pageSize={result.pageSize}
            sort={result.sort}
            dir={result.dir}
            baseParams={sp}
            empty={sp.templates === '1' ? (
              <EmptyState icon={Hammer} title="No templates yet" body="Open a job you like and choose “Save as template”. New jobs can then start with its schedule, to-dos, selections, specs and estimate." />
            ) : all.length === 0 ? (
              <EmptyState icon={Hammer} title={isBuilder ? 'Create your first job' : 'No jobs yet'}
                body={isBuilder ? 'Jobs hold everything: schedule, files, subs, clients and money.' : 'Jobs appear here when a builder adds you to one.'}
                action={isBuilder && can(ctx, 'jobs', 'add') ? <Button asChild variant="primary"><Link href="/jobs/new"><Plus />New job</Link></Button> : undefined} />
            ) : <p className="px-3 py-8 text-center text-[13px] text-text-3">No jobs match these filters.</p>}
          />
        ) : (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState icon={MapPin} title="Map view is coming with address lookup"
              body="Jobs will be plotted by address once Google Maps is connected. Addresses are already saved." />
            <ul className="divide-y divide-border border-t border-border">
              {result.rows.map((j) => (
                <li key={j.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                  <MapPin className="size-4 text-text-3" />
                  <Link href={`/jobs/${j.id}`} className="font-medium text-brand hover:underline">{j.title}</Link>
                  <span className="text-text-3">{[j.street, j.city, j.province, j.postal_code].filter(Boolean).join(', ') || 'No address'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  )
}
