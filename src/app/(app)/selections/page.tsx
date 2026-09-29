import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardList, Plus } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCAD, formatDate, todayIn } from '@/lib/utils'
import { SELECTION_STATUS } from '@/lib/selection'
import { forJobs } from '@/lib/job-filter'

export const metadata: Metadata = { title: 'Selections' }

type Row = { id: string; title: string; job_id: string; category: string | null; location: string | null; status: string; deadline: string | null
  allowance: number | null; selected_choice_id: string | null }

export default async function SelectionsPage({ searchParams }: PageProps<'/selections'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'builder' && !can(ctx, 'selections')) redirect('/summary?denied=selections')
  const picked = mode === 'client' ? ctx.jobs : selectedJobs(ctx)
  const status = typeof sp.status === 'string' && sp.status in SELECTION_STATUS ? sp.status : ''
  const supabase = await createClient()
  let rows: Row[] = []
  if (picked.length && mode === 'sub') {
    // subs get a safe projection (no allowance) of selections shared with them
    const { data } = await supabase.rpc('sub_selections', { p_jobs: picked.map((j) => j.id) })
    rows = (data ?? []).filter((r) => !status || r.status === status).map((r) => ({ ...r, allowance: null }))
  } else if (picked.length) {
    let q = forJobs(supabase.from('selections').select('id,title,job_id,category,location,status,deadline,allowance,selected_choice_id')
      , ctx, picked.map((j) => j.id)).is('deleted_at', null).order('deadline', { ascending: true, nullsFirst: false }).order('title')
    if (status) q = q.eq('status', status as 'draft')
    rows = (await q).data ?? []
  }
  // Prices of picked choices (clients and internal users can read them; subs cannot)
  const chosen = rows.map((r) => r.selected_choice_id).filter(Boolean) as string[]
  const { data: choices } = mode !== 'sub' && chosen.length ? await supabase.from('selection_choices').select('id,title,client_price').in('id', chosen) : { data: [] }
  const choice = new Map((choices ?? []).map((c) => [c.id, c]))
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  const today = todayIn(ctx.tz)
  const canAdd = mode === 'builder' && can(ctx, 'selections', 'add')
  const showMoney = mode !== 'sub'

  return (
    <>
      <PageHeader title="Selections" jobName={mode !== 'client' ? selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length) : null} actions={
        canAdd && <Button asChild variant="primary"><Link href="/selections/new"><Plus />New selection</Link></Button>} />
      {mode !== 'client' && picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap gap-1 text-[13px]">
          {[['', 'All'], ...Object.entries(SELECTION_STATUS).filter(([k]) => mode === 'builder' || k !== 'draft').map(([k, v]) => [k, v.label])].map(([k, l]) => (
            <Link key={k} href={k ? `/selections?status=${k}` : '/selections'} className={`rounded-full border px-3 py-1 ${status === k ? 'border-brand bg-brand-soft text-brand' : 'border-border text-text-2'}`}>{l}</Link>
          ))}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title={mode === 'client' ? 'No selections yet' : 'Let clients choose finishes'}
            body={mode === 'client' ? 'When your builder asks you to choose finishes, they show up here.' : 'List the options, set an allowance and a deadline tied to the schedule, and let the client pick.'}
            action={canAdd ? <Button asChild variant="primary"><Link href="/selections/new"><Plus />New selection</Link></Button> : undefined} />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3">
                <tr><th className="px-4 py-2">Title</th><th className="px-4 py-2">Job</th><th className="px-4 py-2">Category</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Deadline</th>
                  <th className="px-4 py-2">Choice</th>{showMoney && <><th className="px-4 py-2 text-right">Allowance</th><th className="px-4 py-2 text-right">Price</th><th className="px-4 py-2 text-right">Over / under</th></>}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const st = SELECTION_STATUS[r.status]
                  const c = r.selected_choice_id ? choice.get(r.selected_choice_id) : undefined
                  const overdue = r.deadline && r.deadline < today && (r.status === 'pending' || r.status === 'draft')
                  const diff = c && r.allowance != null ? Number(c.client_price) - Number(r.allowance) : null
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2"><Link href={`/selections/${r.id}`} className="font-medium text-brand hover:underline">{r.title}</Link>{r.location && <div className="text-xs text-text-3">{r.location}</div>}</td>
                      <td className="px-4 py-2">{jobName.get(r.job_id)}</td>
                      <td className="px-4 py-2">{r.category}</td>
                      <td className="px-4 py-2"><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className={`px-4 py-2 whitespace-nowrap ${overdue ? 'font-medium text-danger' : ''}`}>{r.deadline ? formatDate(r.deadline) : ''}{overdue ? ' · overdue' : ''}</td>
                      <td className="px-4 py-2">{c?.title}</td>
                      {showMoney && <>
                        <td className="px-4 py-2 text-right tabular-nums">{r.allowance != null ? formatCAD(Number(r.allowance)) : ''}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{c ? formatCAD(Number(c.client_price)) : ''}</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${diff && diff > 0 ? 'text-danger' : diff && diff < 0 ? 'text-success' : ''}`}>{diff != null ? formatCAD(diff) : ''}</td>
                      </>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  )
}
