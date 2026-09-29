import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CloudSun, Pencil, Trash2 } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CommentThread } from '@/components/kit/comments'
import { Attachments } from '@/components/kit/attachments'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { formatDate } from '@/lib/utils'
import { deleteLog } from '../actions'
import { CustomFields } from '@/components/kit/custom-fields'

export const metadata: Metadata = { title: 'Daily log' }

export default async function LogPage({ params }: PageProps<'/daily-logs/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: log } = await supabase.from('daily_logs')
    .select('*, profiles!daily_logs_created_by_fkey(first_name,last_name,email)').eq('id', id).maybeSingle()
  if (!log) notFound()
  const mine = log.created_by === ctx.userId
  const canEdit = mine || can(ctx, 'daily_logs', 'edit')
  const canDelete = mine || can(ctx, 'daily_logs', 'delete')
  const { data: tags } = log.tag_ids.length ? await supabase.from('tags').select('id,name').in('id', log.tag_ids) : { data: [] }
  const w = log.weather as { condition: string; high_c: number; low_c: number; wind_kmh: number; humidity_pct: number | null; precip_mm: number } | null
  const author = log.profiles as { first_name: string; last_name: string; email: string } | null

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost"><Link href="/daily-logs"><ArrowLeft />Daily logs</Link></Button>
        <div className="flex gap-2">
          {canDelete && <form action={deleteLog.bind(null, id)}><ConfirmSubmit variant="ghost" title="Delete this daily log?" body="It will be removed for everyone it was shared with."><Trash2 />Delete</ConfirmSubmit></form>}
          {canEdit && <Button asChild variant="primary"><Link href={`/daily-logs/${id}/edit`}><Pencil />Edit</Link></Button>}
        </div>
      </div>
      <Card>
        <div className="border-b border-border p-4">
          <div className="text-[13px] text-text-3"><Link href={`/jobs/${log.job_id}`} className="hover:underline">{ctx.jobs.find((j) => j.id === log.job_id)?.title}</Link></div>
          <h1 className="text-xl font-semibold">{log.title || formatDate(log.log_date)}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
            <Badge>{formatDate(log.log_date)}</Badge>
            {log.status === 'draft' ? <Badge tone="warning">Draft</Badge> : <Badge tone="success">Published</Badge>}
            {(tags ?? []).map((t) => <Badge key={t.id} tone="brand">{t.name}</Badge>)}
            {ctx.workspace.mode === 'builder' && <>
              {log.share_subs && <Badge>Shared with subs</Badge>}
              {log.share_clients && <Badge>Shared with client</Badge>}
              {!log.share_internal && <Badge tone="warning">Private</Badge>}
            </>}
          </div>
        </div>
        <p className="whitespace-pre-wrap p-4 text-[14px] leading-relaxed">{log.notes}</p>
        {(log.include_weather && w) || (log.include_weather_notes && log.weather_notes) ? (
          <div className="border-t border-border p-4 text-[13px]">
            {log.include_weather && w && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="flex items-center gap-2 font-medium"><CloudSun className="size-5 text-brand" />{w.condition}</span>
                <span>High {w.high_c}°C · Low {w.low_c}°C</span><span>Wind {w.wind_kmh} km/h</span>
                {w.humidity_pct != null && <span>{w.humidity_pct}% humidity</span>}<span>{w.precip_mm} mm precipitation</span>
              </div>
            )}
            {log.include_weather_notes && log.weather_notes && <p className="mt-1 text-text-2">{log.weather_notes}</p>}
          </div>
        ) : null}
        <div className="border-t border-border px-4 py-2 text-xs text-text-3">
          By {author ? `${author.first_name} ${author.last_name}`.trim() || author.email : 'unknown'} · {new Date(log.created_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      </Card>
      <CustomFields module="daily_logs" recordId={id} orgId={log.org_id} path={`/daily-logs/${id}`} canEdit={ctx.workspace.mode === 'builder' && can(ctx, 'daily_logs', 'edit')} audience={ctx.workspace.mode === 'builder' ? 'internal' : ctx.workspace.mode} />
      <Attachments jobId={log.job_id} recordType="daily_log" recordId={id} path={`/daily-logs/${id}`} share={{ subs: log.share_subs, clients: log.share_clients }} canAdd={canEdit} />
      {log.status === 'published' && (
        <CommentThread jobId={log.job_id} recordType="daily_log" recordId={id} mode={ctx.workspace.mode} path={`/daily-logs/${id}`} canShareWithClient={false} />
      )}
    </div>
  )
}
