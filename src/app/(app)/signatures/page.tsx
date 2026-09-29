import type { Metadata } from 'next'
import Link from 'next/link'
import { PenLine } from 'lucide-react'
import { getAppContext, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateTime } from '@/lib/utils'
import { SIG_STATUS } from '@/lib/signature-status'

export const metadata: Metadata = { title: 'Signatures' }

export default async function SignaturesPage() {
  const ctx = await getAppContext()
  const builder = ctx.workspace.mode === 'builder'
  const picked = builder ? selectedJobs(ctx) : ctx.jobs
  const supabase = await createClient()
  const { data: reqs } = picked.length
    ? await supabase.from('signature_requests').select('id,title,job_id,status,sent_at,created_at,signature_request_signers(status)').in('job_id', picked.map((j) => j.id)).order('created_at', { ascending: false }).limit(300)
    : { data: [] }
  const job = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  return (
    <>
      <PageHeader title="Signatures" jobName={builder ? selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length) : null} />
      {builder && picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="p-5">
        <Card className="overflow-x-auto">
          {(reqs ?? []).length === 0 ? (
            <EmptyState icon={PenLine} title={builder ? 'Get documents signed' : 'Nothing to sign'}
              body={builder ? 'Open a PDF in Documents and choose “Request signatures”. Clients, subs and your team sign on any device.' : 'Documents your builder sends you to sign show up here.'} />
          ) : (
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="px-3 py-2">Document</th><th className="px-3 py-2">Job</th><th className="px-3 py-2">Signed</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Sent</th></tr></thead>
              <tbody className="divide-y divide-border">
                {(reqs ?? []).map((r) => {
                  const s = r.signature_request_signers as { status: string }[]
                  const st = SIG_STATUS[r.status]
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2"><Link href={`/signatures/${r.id}`} className="font-medium text-brand hover:underline">{r.title}</Link></td>
                      <td className="px-3 py-2">{job.get(r.job_id)}</td>
                      <td className="px-3 py-2 tabular-nums">{s.filter((x) => x.status === 'signed').length} of {s.length}</td>
                      <td className="px-3 py-2"><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className="px-3 py-2 text-text-3">{r.sent_at ? formatDateTime(r.sent_at, ctx.tz) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  )
}
