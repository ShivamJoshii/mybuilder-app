import type { Metadata } from 'next'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { getAppContext } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { JobStatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { recordHref, recordLabel } from '@/lib/records'

export const metadata: Metadata = { title: 'Search' }

/** Global search across everything the user can see (RLS scopes every query). */
export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const sp = await searchParams
  const q = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 100)
  const ctx = await getAppContext()
  const needle = q.toLowerCase()
  const jobs = q ? ctx.jobs.filter((j) => [j.title, j.street, j.city].some((v) => v?.toLowerCase().includes(needle))).slice(0, 20) : []
  let comments: { id: string; body: string; job_id: string; record_type: string; record_id: string }[] = []
  let hits: Hit[] = []
  if (q && ctx.jobs.length) {
    const supabase = await createClient()
    const like = `%${q.replace(/[%_\\,()"]/g, '')}%`
    const ids = ctx.jobs.map((j) => j.id)
    const [c, ...rest] = await Promise.all([
      supabase.from('comments').select('id,body,job_id,record_type,record_id').in('job_id', ids).ilike('body', like).limit(20),
      ...SOURCES.map((src) => supabase.from(src.table as 'todos').select(src.select).in('job_id', ids).or(src.cols.map((col) => `${col}.ilike."${like}"`).join(','))
        .limit(10).then((r) => ((r.data ?? []) as unknown as Record<string, unknown>[]).filter((row) => !row.deleted_at).map((row) => ({
          type: src.label, id: String(row.id), job_id: String(row.job_id), title: src.title(row), href: src.href(row),
        })))),
    ])
    comments = (c.data ?? []) as typeof comments
    hits = (rest as Hit[][]).flat()
    if (ctx.workspace.mode === 'builder') {
      const { data: leads } = await supabase.from('leads').select('id,title').eq('org_id', ctx.workspace.orgId).ilike('title', like).limit(10)
      hits.push(...(leads ?? []).map((l) => ({ type: 'Lead', id: l.id, job_id: '', title: l.title, href: `/leads/${l.id}` })))
    }
  }
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  return (
    <>
      <PageHeader title={q ? `Results for “${q}”` : 'Search'} />
      <div className="space-y-5 p-5">
        {!q || (jobs.length === 0 && comments.length === 0 && hits.length === 0) ? (
          <Card><EmptyState icon={Search} title={q ? 'Nothing found' : 'Search jobs and records'} body={q ? 'Try a different word or check the spelling.' : 'Use the search box at the top of any page.'} /></Card>
        ) : (
          <>
            {jobs.length > 0 && (
              <Card>
                <CardHeader title="Jobs" />
                <ul className="divide-y divide-border">
                  {jobs.map((j) => (
                    <li key={j.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                      <span className="size-2.5 rounded-full" style={{ background: j.color }} />
                      <Link href={`/jobs/${j.id}`} className="font-medium text-brand hover:underline">{j.title}</Link>
                      <span className="text-text-3">{[j.street, j.city].filter(Boolean).join(', ')}</span>
                      <span className="ml-auto"><JobStatusBadge status={j.status} /></span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {hits.length > 0 && (
              <Card>
                <CardHeader title="Records" />
                <ul className="divide-y divide-border">
                  {hits.map((h) => (
                    <li key={`${h.type}-${h.id}`} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                      <span className="w-28 shrink-0 text-xs text-text-3">{h.type}</span>
                      <Link href={h.href} className="min-w-0 flex-1 truncate font-medium text-brand hover:underline">{h.title}</Link>
                      <span className="text-xs text-text-3">{jobName.get(h.job_id)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {comments.length > 0 && (
              <Card>
                <CardHeader title="Comments" />
                <ul className="divide-y divide-border">
                  {comments.map((c) => (
                    <li key={c.id} className="px-4 py-2 text-[13px]">
                      <Link href={recordHref(c.record_type, c.job_id, c.record_id)} className="text-brand hover:underline">{recordLabel(c.record_type)} · {jobName.get(c.job_id)}</Link>
                      <p className="line-clamp-2 text-text-2">{c.body}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  )
}

type Hit = { type: string; id: string; job_id: string; title: string; href: string }
type Row = Record<string, unknown>
const t = (r: Row, k: string) => String(r[k] ?? '')
const SOURCES: { table: string; label: string; select: string; cols: string[]; title: (r: Row) => string; href: (r: Row) => string }[] = [
  { table: 'todos', label: 'To-do', select: 'id,job_id,title,deleted_at', cols: ['title', 'notes'], title: (r) => t(r, 'title'), href: (r) => `/todos/${t(r, 'id')}` },
  { table: 'daily_logs', label: 'Daily log', select: 'id,job_id,title,log_date,deleted_at', cols: ['title', 'notes'], title: (r) => t(r, 'title') || t(r, 'log_date'), href: (r) => `/daily-logs/${t(r, 'id')}` },
  { table: 'rfis', label: 'RFI', select: 'id,job_id,number,title,deleted_at', cols: ['title', 'question'], title: (r) => `#${t(r, 'number')} ${t(r, 'title')}`, href: (r) => `/rfis/${t(r, 'id')}` },
  { table: 'schedule_items', label: 'Schedule item', select: 'id,job_id,title,deleted_at', cols: ['title'], title: (r) => t(r, 'title'), href: (r) => `/schedule/${t(r, 'id')}` },
  { table: 'change_orders', label: 'Change order', select: 'id,job_id,number,title', cols: ['title', 'description'], title: (r) => `#${t(r, 'number')} ${t(r, 'title')}`, href: (r) => `/change-orders/${t(r, 'id')}` },
  { table: 'selections', label: 'Selection', select: 'id,job_id,title,deleted_at', cols: ['title', 'category', 'location'], title: (r) => t(r, 'title'), href: (r) => `/selections/${t(r, 'id')}` },
  { table: 'purchase_orders', label: 'Purchase order', select: 'id,job_id,number,title,deleted_at', cols: ['title', 'vendor_name'], title: (r) => `PO #${t(r, 'number')} ${t(r, 'title')}`, href: (r) => `/purchase-orders/${t(r, 'id')}` },
  { table: 'bills', label: 'Bill', select: 'id,job_id,number,title,invoice_ref,deleted_at', cols: ['title', 'invoice_ref', 'vendor_name'], title: (r) => t(r, 'invoice_ref') || `Bill #${t(r, 'number')}`, href: (r) => `/bills/${t(r, 'id')}` },
  { table: 'client_invoices', label: 'Invoice', select: 'id,job_id,number,title,deleted_at', cols: ['title'], title: (r) => `#${t(r, 'number')} ${t(r, 'title')}`, href: (r) => `/invoices/${t(r, 'id')}` },
  { table: 'warranty_claims', label: 'Warranty claim', select: 'id,job_id,number,title,deleted_at', cols: ['title', 'description'], title: (r) => `#${t(r, 'number')} ${t(r, 'title')}`, href: (r) => `/warranty/${t(r, 'id')}` },
  { table: 'plan_sheets', label: 'Plan sheet', select: 'id,job_id,number,title,deleted_at', cols: ['number', 'title'], title: (r) => `${t(r, 'number')} ${t(r, 'title')}`, href: (r) => `/plans/${t(r, 'id')}` },
  { table: 'spec_documents', label: 'Specification', select: 'id,job_id,title,deleted_at', cols: ['title', 'body'], title: (r) => t(r, 'title'), href: (r) => `/plans/specs/${t(r, 'id')}` },
  { table: 'files', label: 'File', select: 'id,job_id,name,kind,deleted_at', cols: ['name'], title: (r) => t(r, 'name'), href: (r) => `/${t(r, 'kind')}?file=${t(r, 'id')}` },
  { table: 'email_threads', label: 'Email', select: 'id,job_id,subject', cols: ['subject'], title: (r) => t(r, 'subject'), href: (r) => `/messages/${t(r, 'id')}` },
  { table: 'bid_packages', label: 'Bid package', select: 'id,job_id,number,title,deleted_at', cols: ['title'], title: (r) => t(r, 'title'), href: (r) => `/bids/${t(r, 'id')}` },
]
