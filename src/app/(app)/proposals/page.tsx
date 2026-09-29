import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileSignature } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCAD, formatDate } from '@/lib/utils'
import { PROPOSAL_STATUS } from '@/lib/estimate'
import { forJobs } from '@/lib/job-filter'

export const metadata: Metadata = { title: 'Proposals' }

export default async function ProposalsPage({ searchParams }: PageProps<'/proposals'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'sub') redirect('/summary')
  if (mode === 'builder' && !can(ctx, 'proposals') && !can(ctx, 'estimates')) redirect('/summary?denied=proposals')
  const status = typeof sp.status === 'string' ? sp.status : ''
  const supabase = await createClient()
  let q = forJobs(supabase.from('proposals').select('id,title,status,total,job_id,released_at,decided_at,approval_deadline,created_at')
    , ctx, ctx.jobs.map((j) => j.id)).order('created_at', { ascending: false })
  if (status && status in PROPOSAL_STATUS) q = q.eq('status', status as 'draft')
  const { data: rows } = await q
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))

  return (
    <>
      <PageHeader title="Proposals" />
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap gap-1 text-[13px]">
          {[['', 'All'], ...Object.entries(PROPOSAL_STATUS).filter(([k]) => mode === 'builder' || k !== 'draft').map(([k, v]) => [k, v.label])].map(([k, label]) => (
            <Link key={k} href={k ? `/proposals?status=${k}` : '/proposals'} className={`rounded-full border px-3 py-1 ${status === k ? 'border-brand bg-brand-soft text-brand' : 'border-border text-text-2'}`}>{label}</Link>
          ))}
        </div>
        {(rows ?? []).length === 0 ? (
          <EmptyState icon={FileSignature} title={mode === 'client' ? 'No proposals yet' : 'Send proposals clients can sign'}
            body={mode === 'client' ? 'When your builder sends a proposal, it shows up here for you to review and sign.' : 'Create a proposal from a job’s estimate, then release it for e-signature.'} />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3">
                <tr><th className="px-4 py-2">Title</th><th className="px-4 py-2">Job</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Released</th><th className="px-4 py-2">Deadline</th><th className="px-4 py-2 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(rows ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2"><Link href={`/proposals/${r.id}`} className="font-medium text-brand hover:underline">{r.title}</Link></td>
                    <td className="px-4 py-2">{jobName.get(r.job_id)}</td>
                    <td className="px-4 py-2"><Badge tone={PROPOSAL_STATUS[r.status].tone}>{PROPOSAL_STATUS[r.status].label}</Badge></td>
                    <td className="px-4 py-2">{r.released_at ? formatDate(r.released_at) : ''}</td>
                    <td className="px-4 py-2">{r.approval_deadline ? formatDate(r.approval_deadline) : ''}</td>
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
