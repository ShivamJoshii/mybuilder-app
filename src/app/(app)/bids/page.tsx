import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Gavel, Plus } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCAD, formatDateTime } from '@/lib/utils'
import { BID_REQUEST_STATUS, BID_STATUS } from '@/lib/estimate'

export const metadata: Metadata = { title: 'Bids' }

export default async function BidsPage() {
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'client') redirect('/summary')
  if (mode === 'builder' && !(can(ctx, 'bids') && can(ctx, 'bids', 'cost'))) redirect('/summary?denied=bids')
  const supabase = await createClient()

  if (mode === 'sub') {
    // Bid requests for my company, from every builder (presale jobs included)
    const { data: rows0 } = await supabase.rpc('my_bid_requests')
    const rows = rows0 ?? []
    return (
      <>
        <PageHeader title="Bid requests" />
        <div className="p-5">
          {rows.length === 0 ? <EmptyState icon={Gavel} title="No bid requests yet" body="When a builder invites your company to bid, the request shows up here." /> : (
            <Card className="overflow-hidden">
              <table className="w-full text-[13px]">
                <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="px-4 py-2">Package</th><th className="px-4 py-2">Builder</th><th className="px-4 py-2">Job</th><th className="px-4 py-2">Due</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">My bid</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.request_id}>
                      <td className="px-4 py-2"><Link href={`/bids/${r.package_id}`} className="font-medium text-brand hover:underline">{r.title}</Link></td>
                      <td className="px-4 py-2">{r.builder_name}</td>
                      <td className="px-4 py-2">{r.job_title}{r.job_city ? `, ${r.job_city}` : ''}</td>
                      <td className="px-4 py-2">{formatDateTime(r.due_at)}</td>
                      <td className="px-4 py-2"><Badge tone={BID_REQUEST_STATUS[r.status].tone}>{BID_REQUEST_STATUS[r.status].label}</Badge></td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.total != null ? formatCAD(Number(r.total)) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </>
    )
  }

  const picked = selectedJobs(ctx)
  const { data: pkgs } = picked.length ? await supabase.from('bid_packages').select('id,number,title,status,due_at,job_id,bid_requests(status,total)')
    .in('job_id', picked.map((j) => j.id)).is('deleted_at', null).order('created_at', { ascending: false }) : { data: [] }
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  const canAdd = can(ctx, 'bids', 'add')
  return (
    <>
      <PageHeader title="Bids" jobName={selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length)} actions={canAdd && <Button asChild variant="primary"><Link href="/bids/new"><Plus />New bid package</Link></Button>} />
      {picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="p-5">
        {(pkgs ?? []).length === 0 ? (
          <EmptyState icon={Gavel} title="Collect bids from your trades" body="Send a bid package to your subs and vendors, compare prices line by line, and award the work as a purchase order."
            action={canAdd ? <Button asChild variant="primary"><Link href="/bids/new"><Plus />New bid package</Link></Button> : undefined} />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="w-12 px-4 py-2">#</th><th className="px-4 py-2">Title</th><th className="px-4 py-2">Job</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Due</th><th className="px-4 py-2">Responses</th><th className="px-4 py-2 text-right">Lowest bid</th></tr></thead>
              <tbody className="divide-y divide-border">
                {(pkgs ?? []).map((p) => {
                  const reqs = p.bid_requests ?? []
                  const subm = reqs.filter((r) => r.total != null)
                  const low = subm.length ? Math.min(...subm.map((r) => Number(r.total))) : null
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-2 text-text-3">{p.number}</td>
                      <td className="px-4 py-2"><Link href={`/bids/${p.id}`} className="font-medium text-brand hover:underline">{p.title}</Link></td>
                      <td className="px-4 py-2">{jobName.get(p.job_id)}</td>
                      <td className="px-4 py-2"><Badge tone={BID_STATUS[p.status].tone}>{BID_STATUS[p.status].label}</Badge></td>
                      <td className="px-4 py-2">{formatDateTime(p.due_at)}</td>
                      <td className="px-4 py-2">{subm.length} of {reqs.length}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{low != null ? formatCAD(low) : ''}</td>
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
