import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Mail, Plus } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { CopyButton } from '@/components/kit/copy-button'
import { jobAddress } from '@/lib/email'
import { formatDateTime } from '@/lib/utils'
import { forJobs } from '@/lib/job-filter'

export const metadata: Metadata = { title: 'Messages' }

export default async function MessagesPage() {
  const ctx = await getAppContext()
  if (ctx.workspace.mode !== 'builder') redirect('/chat')
  if (!can(ctx, 'messages')) redirect('/summary?denied=messages')
  const picked = selectedJobs(ctx)
  const ids = picked.map((j) => j.id)
  const supabase = await createClient()
  const [{ data: threads }, { data: boxes }] = ids.length ? await Promise.all([
    forJobs(supabase.from('email_threads').select('id,job_id,subject,last_at,email_messages(direction,from_name,from_email,status,created_at)'), ctx, ids).order('last_at', { ascending: false }).limit(200),
    forJobs(supabase.from('job_mailboxes').select('job_id,token'), ctx, ids),
  ]) : [{ data: [] }, { data: [] }]
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  const canAdd = can(ctx, 'messages', 'add')
  return (
    <>
      <PageHeader title="Messages" jobName={selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length)} actions={canAdd && <Button asChild variant="primary"><Link href="/messages/new"><Plus />New message</Link></Button>} />
      {picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="space-y-3 p-5">
        {picked.length === 1 && boxes?.[0] && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-2">
            Job email address: <code className="rounded bg-surface-2 px-1.5 py-0.5">{jobAddress(boxes[0].token)}</code>
            <CopyButton value={jobAddress(boxes[0].token)} label="Copy address" />
            <span className="text-text-3">CC it on any email to keep it with the job. Replies to messages sent from here come back automatically.</span>
          </div>
        )}
        {(threads ?? []).length === 0 ? (
          <EmptyState icon={Mail} title="Email, kept with the job" body="Send email from the job so the whole history lives here. Replies come back to the job automatically."
            action={canAdd ? <Button asChild variant="primary"><Link href="/messages/new"><Plus />New message</Link></Button> : undefined} />
        ) : (
          <Card className="divide-y divide-border">
            {(threads ?? []).map((t) => {
              const msgs = [...(t.email_messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
              const last = msgs[msgs.length - 1]
              const people = [...new Set(msgs.map((m) => (m.direction === 'in' ? m.from_name || m.from_email : 'You')))].join(', ')
              return (
                <Link key={t.id} href={`/messages/${t.id}`} className="flex items-center gap-3 px-4 py-3 text-[13px] hover:bg-surface-2">
                  <Mail className="size-4 shrink-0 text-text-3" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.subject} <span className="font-normal text-text-3">({msgs.length})</span></div>
                    <div className="truncate text-xs text-text-3">{people} · {jobName.get(t.job_id)}</div>
                  </div>
                  {last?.status === 'queued' && <span className="text-xs text-warning">Queued</span>}
                  {last?.status === 'failed' && <span className="text-xs text-danger">Failed</span>}
                  <span className="shrink-0 text-xs text-text-3">{formatDateTime(t.last_at, ctx.tz)}</span>
                </Link>
              )
            })}
          </Card>
        )}
      </div>
    </>
  )
}
