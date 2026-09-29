import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, Plus, Target } from 'lucide-react'
import { requireBuilder, can } from '@/lib/context'
import { fetchLeads, fetchLookups, ageDays, revenue, type LeadRow } from '@/lib/leads'
import { resolveDateRange } from '@/lib/date-range'
import { PageHeader } from '@/components/shell/page-header'
import { FilterDrawer, type FilterDef } from '@/components/kit/filter-drawer'
import { SavedViews } from '@/components/kit/saved-views'
import { DataTable, type Column } from '@/components/kit/data-table'
import { fetchViews } from '@/lib/views'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, formatDate } from '@/lib/utils'
import { StatusSelect } from './status-select'

export const metadata: Metadata = { title: 'Lead opportunities' }

type Sp = Record<string, string | string[] | undefined>
const arr = (v: Sp[string]) => (v == null ? [] : Array.isArray(v) ? v : [v])
const one = (v: Sp[string]) => (Array.isArray(v) ? v[0] : v)

export default async function LeadsPage({ searchParams }: PageProps<'/leads'>) {
  const sp = await searchParams
  const ctx = await requireBuilder('leads')
  const [l, all, views] = await Promise.all([fetchLookups(ctx.workspace.orgId), fetchLeads(ctx.workspace.orgId), fetchViews(ctx, 'leads')])
  const tab = (['list', 'pipeline', 'map'] as const).find((t) => t === one(sp.tab)) ?? 'list'
  const statusById = new Map(l.statuses.map((s) => [s.id, s]))
  const sourceName = new Map(l.sources.map((s) => [s.id, s.name]))
  const personName = new Map(l.salespeople.map((s) => [s.id, s.name]))

  const q = one(sp.q)?.toLowerCase()
  const st = arr(sp.status), sps = arr(sp.salesperson), src = arr(sp.source), pt = arr(sp.type)
  const created = resolveDateRange(one(sp.created), one(sp.created_from), one(sp.created_to))
  const rows = all.filter((x) =>
    (!q || [x.title, x.contact_first, x.contact_last, x.contact_email, x.site_city].some((v) => v?.toLowerCase().includes(q))) &&
    (!st.length || st.includes(x.status_id)) && (!sps.length || x.salespeople.some((s) => sps.includes(s))) &&
    (!src.length || x.source_ids.some((s) => src.includes(s))) && (!pt.length || x.project_type_ids.some((s) => pt.includes(s))) &&
    (!created.from || x.created_at.slice(0, 10) >= created.from) && (!created.to || x.created_at.slice(0, 10) <= created.to))

  const filters: FilterDef[] = [
    { type: 'text', name: 'q', label: 'Keywords' },
    { type: 'multi', name: 'status', label: 'Status', options: l.statuses.map((s) => ({ value: s.id, label: s.name })) },
    { type: 'multi', name: 'salesperson', label: 'Salesperson', options: l.salespeople.map((s) => ({ value: s.id, label: s.name })) },
    { type: 'multi', name: 'source', label: 'Source', options: l.sources.map((s) => ({ value: s.id, label: s.name })) },
    { type: 'multi', name: 'type', label: 'Project type', options: l.types.map((s) => ({ value: s.id, label: s.name })) },
    { type: 'date', name: 'created', label: 'Created date' },
  ]
  const canEdit = can(ctx, 'leads', 'edit')
  const columns: Column<LeadRow>[] = [
    { key: 'title', label: 'Opportunity', render: (x) => <Link href={`/leads/${x.id}`} className="font-medium text-brand hover:underline">{x.title}</Link> },
    { key: 'contact', label: 'Contact', render: (x) => <div><div>{`${x.contact_first} ${x.contact_last}`.trim()}</div><div className="text-xs text-text-3">{x.contact_email ?? x.contact_phone}</div></div> },
    { key: 'status', label: 'Status', render: (x) => canEdit ? <StatusSelect id={x.id} value={x.status_id} statuses={l.statuses} /> : statusById.get(x.status_id)?.name },
    { key: 'salesperson', label: 'Salesperson', render: (x) => x.salespeople.map((s) => personName.get(s)).filter(Boolean).join(', ') },
    { key: 'source', label: 'Source', render: (x) => x.source_ids.map((s) => sourceName.get(s)).filter(Boolean).join(', ') },
    { key: 'confidence', label: 'Confidence', render: (x) => (x.confidence == null ? '' : `${x.confidence}%`) },
    { key: 'revenue', label: 'Est. revenue', className: 'whitespace-nowrap', render: (x) => revenue(x.est_revenue_min, x.est_revenue_max) },
    { key: 'sale', label: 'Projected sale', className: 'whitespace-nowrap', render: (x) => formatDate(x.projected_sale_date) },
    { key: 'age', label: 'Age', render: (x) => `${ageDays(x.created_at)}d` },
    { key: 'last', label: 'Last activity', className: 'whitespace-nowrap', render: (x) => formatDate(x.last_activity) },
  ]
  const tabHref = (t: string) => { const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => arr(v).map((x) => [k, x]))); p.set('tab', t); return `/leads?${p}` }
  const weighted = rows.filter((x) => statusById.get(x.status_id)?.category === 'open').reduce((s, x) => s + ((x.est_revenue_max ?? x.est_revenue_min ?? 0) * (x.confidence ?? 0)) / 100, 0)

  return (
    <>
      <PageHeader title="Lead opportunities" actions={<>
        <SavedViews module="leads" views={views} canShare />
        <FilterDrawer filters={filters} />
        {can(ctx, 'leads', 'add') && <Button asChild variant="primary"><Link href="/leads/new"><Plus />New lead</Link></Button>}
      </>}>
        <div className="mt-3 flex items-end justify-between gap-4 text-[13px]">
          <div className="flex gap-4" role="tablist">
            {[['list', 'List'], ['pipeline', 'Pipeline'], ['map', 'Map']].map(([k, v]) => (
              <Link key={k} href={tabHref(k)} role="tab" aria-selected={tab === k} className={cn('-mb-3 border-b-2 pb-2 font-medium', tab === k ? 'border-brand text-brand' : 'border-transparent text-text-3 hover:text-text')}>{v}</Link>
            ))}
          </div>
          <span className="pb-1 text-xs text-text-3">{rows.length} {rows.length === 1 ? 'lead' : 'leads'} · weighted pipeline {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(weighted)}</span>
        </div>
      </PageHeader>
      <div className="p-5">
        {all.length === 0 ? (
          <Card><EmptyState icon={Target} title="Track every lead in one pipeline" body="Add leads by hand, or put a MyBuilder form on your website so enquiries land here automatically."
            action={can(ctx, 'leads', 'add') ? <Button asChild variant="primary"><Link href="/leads/new"><Plus />New lead</Link></Button> : undefined} /></Card>
        ) : tab === 'list' ? (
          <DataTable rows={rows} columns={columns} total={rows.length} page={1} pageSize={Math.max(rows.length, 1)} baseParams={sp}
            empty={<p className="px-3 py-8 text-center text-[13px] text-text-3">No leads match these filters.</p>} />
        ) : tab === 'pipeline' ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {l.statuses.map((s) => {
              const col = rows.filter((x) => x.status_id === s.id)
              const total = col.reduce((a, x) => a + (x.est_revenue_max ?? x.est_revenue_min ?? 0), 0)
              return (
                <section key={s.id} className="w-64 shrink-0 rounded-lg border border-border bg-surface-2/60" aria-label={s.name}>
                  <header className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                    <h2 className="flex-1 text-[13px] font-semibold">{s.name}</h2>
                    <span className="text-xs text-text-3">{col.length}</span>
                  </header>
                  <div className="px-3 py-1 text-xs text-text-3">{total ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(total) : ' '}</div>
                  <ul className="space-y-2 p-2 pt-0">
                    {col.map((x) => (
                      <li key={x.id} className="rounded-md border border-border bg-surface p-2.5 text-[13px] shadow-sm">
                        <Link href={`/leads/${x.id}`} className="font-medium hover:text-brand hover:underline">{x.title}</Link>
                        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-text-3">
                          {revenue(x.est_revenue_min, x.est_revenue_max) && <span>{revenue(x.est_revenue_min, x.est_revenue_max)}</span>}
                          {x.confidence != null && <span>{x.confidence}%</span>}
                          <span>{ageDays(x.created_at)}d old</span>
                        </div>
                        {canEdit && <div className="mt-2"><StatusSelect id={x.id} value={x.status_id} statuses={l.statuses} compact /></div>}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        ) : (
          <Card>
            <EmptyState icon={MapPin} title="Map view is coming with address lookup" body="Lead sites will be plotted once Google Maps is connected." />
            <ul className="divide-y divide-border border-t border-border">
              {rows.map((x) => <li key={x.id} className="flex gap-3 px-4 py-2 text-[13px]"><MapPin className="size-4 text-text-3" /><Link href={`/leads/${x.id}`} className="font-medium text-brand hover:underline">{x.title}</Link><span className="text-text-3">{[x.site_street, x.site_city].filter(Boolean).join(', ') || 'No address'}</span></li>)}
            </ul>
          </Card>
        )}
      </div>
    </>
  )
}
