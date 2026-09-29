import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileQuestion, Plus } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { FilterDrawer, type FilterDef } from '@/components/kit/filter-drawer'
import { DataTable, type Column } from '@/components/kit/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'
import { RFI_STATUS } from '@/lib/rfi'

export const metadata: Metadata = { title: 'RFIs' }

type Sp = Record<string, string | string[] | undefined>
const arr = (v: Sp[string]) => (v == null ? [] : Array.isArray(v) ? v : [v])
const one = (v: Sp[string]) => (Array.isArray(v) ? v[0] : v)

type Row = {
  id: string; number: number; title: string; status: string; due_date: string; job_id: string; created_by: string
  assignee_user_id: string | null; assignee_sub_org_id: string | null; author_sub_org_id: string | null
  assignee: { first_name: string; last_name: string } | null; assignee_org: { name: string } | null
  creator: { first_name: string; last_name: string } | null
  rfi_responses: { id: string }[]
}

export default async function RfisPage({ searchParams }: PageProps<'/rfis'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'client') redirect('/summary')
  if (mode === 'builder' && !can(ctx, 'rfis')) redirect('/summary?denied=rfis')
  const picked = selectedJobs(ctx)
  const supabase = await createClient()
  let rows: Row[] = []
  if (picked.length) {
    const { data } = await supabase.from('rfis')
      .select(`id,number,title,status,due_date,job_id,created_by,assignee_user_id,assignee_sub_org_id,author_sub_org_id,
               assignee:profiles!rfis_assignee_user_id_fkey(first_name,last_name),
               assignee_org:organizations!rfis_assignee_sub_org_id_fkey(name),
               creator:profiles!rfis_created_by_fkey(first_name,last_name),
               rfi_responses(id)`)
      .in('job_id', picked.map((j) => j.id)).is('deleted_at', null).order('created_at', { ascending: false })
    rows = (data ?? []) as unknown as Row[]
  }
  const { data: rel } = rows.length ? await supabase.from('related_items').select('from_id,to_type').eq('from_type', 'rfi').in('from_id', rows.map((r) => r.id)) : { data: [] }
  const myOrgs = ctx.orgs.map((o) => o.org_id)
  const mine = (r: Row) => r.assignee_user_id === ctx.userId || (r.assignee_sub_org_id != null && myOrgs.includes(r.assignee_sub_org_id))
  const kw = one(sp.q)?.toLowerCase()
  const user = one(sp.user)
  const statuses = arr(sp.status)
  const types = arr(sp.related)
  const files = one(sp.files)
  const filtered = rows.filter((r) =>
    (!kw || r.title.toLowerCase().includes(kw) || String(r.number) === kw) &&
    (!user || (user === 'assigned' ? mine(r) : user === 'created' ? r.created_by === ctx.userId : mine(r) || r.created_by === ctx.userId)) &&
    (!statuses.length || statuses.includes(r.status)) &&
    (!types.length || (rel ?? []).some((x) => x.from_id === r.id && types.includes(x.to_type))) &&
    (files !== 'with'))   // attachments arrive with Files (build step 3); nothing has files yet

  const filters: FilterDef[] = [
    { type: 'text', name: 'q', label: 'Search' },
    { type: 'select', name: 'user', label: 'User', options: [
      { value: 'assigned', label: 'Assigned to me' }, { value: 'both', label: 'Assigned to / created by me' }, { value: 'created', label: 'Created by me' }] },
    { type: 'multi', name: 'status', label: 'Status', options: Object.entries(RFI_STATUS).map(([value, v]) => ({ value, label: v.label })) },
    { type: 'multi', name: 'related', label: 'Related types', options: [{ value: 'todo', label: 'To-do' }, { value: 'daily_log', label: 'Daily log' }, { value: 'rfi', label: 'RFI' }] },
    { type: 'files', name: 'files', label: 'Files' },
  ]
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  const today = new Date().toISOString().slice(0, 10)
  const columns: Column<Row>[] = [
    { key: 'number', label: '#', className: 'w-12 text-text-3', render: (r) => r.number },
    { key: 'title', label: 'Title', render: (r) => <Link href={`/rfis/${r.id}`} className="font-medium text-brand hover:underline">{r.title}</Link> },
    { key: 'job', label: 'Job', render: (r) => jobName.get(r.job_id) },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={RFI_STATUS[r.status].tone}>{RFI_STATUS[r.status].label}</Badge> },
    { key: 'assignee', label: 'Assignee', render: (r) => r.assignee ? `${r.assignee.first_name} ${r.assignee.last_name}` : r.assignee_org?.name ?? <span className="text-text-3">Builder</span> },
    { key: 'due', label: 'Due', className: 'whitespace-nowrap', render: (r) => <span className={r.due_date < today && !['completed'].includes(r.status) ? 'font-medium text-danger' : ''}>{formatDate(r.due_date)}</span> },
    { key: 'responses', label: 'Responses', render: (r) => r.rfi_responses.length },
    { key: 'creator', label: 'Created by', render: (r) => r.creator ? `${r.creator.first_name} ${r.creator.last_name}` : '' },
  ]
  const canCreate = mode === 'sub' || can(ctx, 'rfis', 'add')

  return (
    <>
      <PageHeader title="RFIs" jobName={selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length)} actions={<>
        <FilterDrawer filters={filters} />
        {canCreate && <Button asChild variant="primary"><Link href="/rfis/new"><Plus />Create new RFI</Link></Button>}
      </>} />
      {picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="p-5">
        <DataTable rows={filtered} columns={columns} total={filtered.length} page={1} pageSize={Math.max(filtered.length, 1)} baseParams={sp}
          empty={<EmptyState icon={FileQuestion} title="Clarify the unknown with RFIs" body="Ask your team or trades a question, link it to the records it's about, and track the answer."
            action={canCreate ? <Button asChild variant="primary"><Link href="/rfis/new"><Plus />Add an RFI</Link></Button> : undefined} />} />
      </div>
    </>
  )
}
