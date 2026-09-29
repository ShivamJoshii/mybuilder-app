import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileCheck2, Plus } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCAD, formatDate } from '@/lib/utils'
import { CO_STATUS } from '@/lib/estimate'
import { forJobs } from '@/lib/job-filter'

export const metadata: Metadata = { title: 'Change orders' }

export default async function ChangeOrdersPage({ searchParams }: PageProps<'/change-orders'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'sub') redirect('/summary')
  if (mode === 'builder' && !can(ctx, 'change_orders')) redirect('/summary?denied=change_orders')
  const picked = mode === 'client' ? ctx.jobs : selectedJobs(ctx)
  const status = typeof sp.status === 'string' && sp.status in CO_STATUS ? sp.status : ''
  const supabase = await createClient()
  let rows: { id: string; number: number; title: string; status: string; total: number | null; job_id: string; requested_by_client: boolean; approval_deadline: string | null; released_at: string | null }[] = []
  if (picked.length) {
    let q = forJobs(supabase.from('change_orders').select('id,number,title,status,total,job_id,requested_by_client,approval_deadline,released_at')
      , ctx, picked.map((j) => j.id)).order('created_at', { ascending: false })
    if (status) q = q.eq('status', status as 'draft')
    rows = (await q).data ?? []
  }
  let canRequest = false
  if (mode === 'client' && ctx.jobs.length) {
    const checks = await Promise.all(ctx.jobs.map((j) => supabase.rpc('client_can', { p_job: j.id, p_key: 'submit_change_orders' })))
    canRequest = checks.some((c) => c.data === true)
  }
  const canCreate = mode === 'builder' ? can(ctx, 'change_orders', 'add') : canRequest
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  const approvedTotal = rows.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.total ?? 0), 0)
  const label = (s: string, byClient: boolean) => (s === 'draft' && byClient ? { label: 'Requested', tone: 'warning' as const } : CO_STATUS[s])

  return (
    <>
      <PageHeader title="Change orders" jobName={mode === 'builder' ? selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length) : null} actions={
        canCreate && <Button asChild variant="primary"><Link href="/change-orders/new"><Plus />{mode === 'client' ? 'Request a change' : 'New change order'}</Link></Button>
      } />
      {mode === 'builder' && picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-1 text-[13px]">
          {[['', 'All'], ...Object.entries(CO_STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
            <Link key={k} href={k ? `/change-orders?status=${k}` : '/change-orders'} className={`rounded-full border px-3 py-1 ${status === k ? 'border-brand bg-brand-soft text-brand' : 'border-border text-text-2'}`}>{l}</Link>
          ))}
          {rows.length > 0 && <span className="ml-auto text-text-3">Approved: <span className="font-medium text-text tabular-nums">{formatCAD(approvedTotal)}</span></span>}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={FileCheck2} title="Get changes approved in writing"
            body={mode === 'client' ? 'Change orders from your builder show up here for you to review and sign.' : 'Price a change, send it to your client for e-signature, and the budget and contract price update when they approve.'}
            action={canCreate ? <Button asChild variant="primary"><Link href="/change-orders/new"><Plus />{mode === 'client' ? 'Request a change' : 'New change order'}</Link></Button> : undefined} />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3">
                <tr><th className="w-12 px-4 py-2">#</th><th className="px-4 py-2">Title</th><th className="px-4 py-2">Job</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Deadline</th><th className="px-4 py-2 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const st = label(r.status, r.requested_by_client)
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2 text-text-3">{r.number}</td>
                      <td className="px-4 py-2"><Link href={`/change-orders/${r.id}`} className="font-medium text-brand hover:underline">{r.title}</Link></td>
                      <td className="px-4 py-2">{jobName.get(r.job_id)}</td>
                      <td className="px-4 py-2"><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className="px-4 py-2">{r.approval_deadline ? formatDate(r.approval_deadline) : ''}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.total != null ? formatCAD(Number(r.total)) : ''}</td>
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
