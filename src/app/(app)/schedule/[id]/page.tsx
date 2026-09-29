import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Check, Pencil, Trash2, X } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchItemNotes, fetchSchedule } from '@/lib/schedule/data'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { CommentThread } from '@/components/kit/comments'
import { formatDate, formatDateTime } from '@/lib/utils'
import { addLink, removeLink, deleteItem, setComplete, respond } from '../actions'

export const metadata: Metadata = { title: 'Schedule item' }

export default async function ItemPage({ params }: PageProps<'/schedule/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: base } = await supabase.from('schedule_items').select('job_id').eq('id', id).maybeSingle()
  if (!base) notFound()
  const { items, links, online, phases } = await fetchSchedule([base.job_id])
  const item = items.find((i) => i.id === id)
  const notes = await fetchItemNotes(id)
  if (!item) notFound()
  const mode = ctx.workspace.mode
  const editor = mode === 'builder' && can(ctx, 'schedule', 'edit')
  const title = new Map(items.map((i) => [i.id, i.title]))
  const preds = links.filter((l) => l.successor_id === id)
  const succs = links.filter((l) => l.predecessor_id === id)
  const myOrgs = new Set(ctx.orgs.map((o) => o.org_id))
  const mine = item.assignees.find((a) => a.user_id === ctx.userId || (a.sub_org_id && myOrgs.has(a.sub_org_id)))
  const { data: shifts } = editor ? await supabase.from('schedule_shifts').select('*').eq('item_id', id).order('shifted_at', { ascending: false }).limit(20) : { data: [] }
  const tone = (s: string) => (s === 'confirmed' ? 'success' : s === 'declined' ? 'danger' : 'warning') as 'success' | 'danger' | 'warning'

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost"><Link href="/schedule"><ArrowLeft />Schedule</Link></Button>
        <div className="flex gap-2">
          {mine && mode === 'sub' && online.get(base.job_id) && <>
            <form action={respond.bind(null, id, false)}><Button type="submit"><X />Decline</Button></form>
            <form action={respond.bind(null, id, true)}><Button type="submit" variant="primary"><Check />Confirm</Button></form>
          </>}
          {editor && <form action={setComplete.bind(null, id, !item.completed_at)}><Button type="submit"><Check />{item.completed_at ? 'Mark incomplete' : 'Mark complete'}</Button></form>}
          {mode === 'builder' && can(ctx, 'schedule', 'delete') && <form action={deleteItem.bind(null, id)}><ConfirmSubmit variant="ghost" title="Delete this item?" body="Links to other items are removed too."><Trash2 />Delete</ConfirmSubmit></form>}
          {editor && <Button asChild variant="primary"><Link href={`/schedule/${id}/edit`}><Pencil />Edit</Link></Button>}
        </div>
      </div>
      <Card>
        <div className="p-4">
          <div className="text-[13px] text-text-3"><Link href={`/jobs/${item.job_id}`} className="hover:underline">{ctx.jobs.find((j) => j.id === item.job_id)?.title}</Link>{item.phase_id && ` · ${phases.find((p) => p.id === item.phase_id)?.name}`}</div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><span className="size-3 rounded-full" style={{ background: item.color ?? '#4F7CAC' }} />{item.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
            <Badge>{formatDate(item.start_date)} – {formatDate(item.end_date)}</Badge>
            <Badge>{item.duration} workday{item.duration === 1 ? '' : 's'}</Badge>
            {item.is_hourly && item.start_time && <Badge>{item.start_time.slice(0, 5)}–{item.end_time?.slice(0, 5)}</Badge>}
            {item.completed_at ? <Badge tone="success">Completed</Badge> : <Badge tone="brand">{item.progress}% done</Badge>}
            {mode === 'builder' && !online.get(base.job_id) && <Badge tone="warning">Schedule offline</Badge>}
          </div>
        </div>
        <div className="grid gap-4 border-t border-border p-4 text-[13px] sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium text-text-3">Assigned to</div>
            {item.assignees.length === 0 ? <span className="text-text-3">Nobody</span> : (
              <ul className="space-y-1">{item.assignees.map((a) => <li key={a.id} className="flex items-center gap-2">{a.label}{a.sub_org_id && <Badge tone={tone(a.status)}>{a.status}</Badge>}</li>)}</ul>
            )}
          </div>
          <div className="space-y-2">
            {item.notes_all && <div><div className="text-xs font-medium text-text-3">Notes</div><p className="whitespace-pre-wrap">{item.notes_all}</p></div>}
            {mode === 'builder' && notes.notes_internal && <div><div className="text-xs font-medium text-text-3">Internal notes</div><p className="whitespace-pre-wrap">{notes.notes_internal}</p></div>}
            {(mode === 'builder' || mode === 'sub') && notes.notes_sub && <div><div className="text-xs font-medium text-text-3">Notes for subs</div><p className="whitespace-pre-wrap">{notes.notes_sub}</p></div>}
            {(mode === 'builder' || mode === 'client') && notes.notes_client && <div><div className="text-xs font-medium text-text-3">Notes for client</div><p className="whitespace-pre-wrap">{notes.notes_client}</p></div>}
          </div>
        </div>
      </Card>

      {mode === 'builder' && (
        <Card>
          <CardHeader title="Predecessors" description="This item starts after its predecessors allow. Moving them moves this item." />
          <ul className="divide-y divide-border">
            {preds.map((l) => (
              <li key={l.predecessor_id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                <Link href={`/schedule/${l.predecessor_id}`} className="flex-1 text-brand hover:underline">{title.get(l.predecessor_id)}</Link>
                <Badge>{l.type === 'FS' ? 'Finish to start' : 'Start to start'}</Badge>
                <span className="text-text-3">{l.lag_days === 0 ? 'no lag' : l.lag_days > 0 ? `+${l.lag_days} days` : `${l.lag_days} days`}</span>
                {editor && <form action={removeLink.bind(null, l.predecessor_id, id)}><Button type="submit" size="icon" variant="ghost" aria-label="Remove link"><X /></Button></form>}
              </li>
            ))}
            {preds.length === 0 && <li className="px-4 py-3 text-[13px] text-text-3">No predecessors.</li>}
          </ul>
          {editor && items.length > 1 && (
            <ActionForm action={addLink.bind(null, id)} className="flex flex-wrap items-end gap-2 border-t border-border p-4">
              <Select name="predecessor_id" aria-label="Predecessor" className="min-w-56 flex-1" required>
                <option value="">Add a predecessor…</option>
                {items.filter((i) => i.id !== id && !preds.some((p) => p.predecessor_id === i.id)).map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
              </Select>
              <Select name="type" aria-label="Link type" className="w-40"><option value="FS">Finish to start</option><option value="SS">Start to start</option></Select>
              <Input name="lag_days" type="number" aria-label="Lag days" placeholder="Lag" className="w-20" min={-365} max={365} />
              <Button type="submit">Add link</Button>
            </ActionForm>
          )}
          {succs.length > 0 && (
            <div className="border-t border-border px-4 py-2 text-[13px] text-text-3">
              Followed by: {succs.map((l, k) => <span key={l.successor_id}>{k > 0 && ', '}<Link className="text-brand hover:underline" href={`/schedule/${l.successor_id}`}>{title.get(l.successor_id)}</Link></span>)}
            </div>
          )}
        </Card>
      )}

      {editor && (shifts ?? []).length > 0 && (
        <Card>
          <CardHeader title="Shift history" />
          <ul className="divide-y divide-border text-[13px]">
            {(shifts ?? []).map((s) => (
              <li key={s.id} className="px-4 py-2">
                {formatDate(s.old_start)} → <strong>{formatDate(s.new_start)}</strong>
                <span className="text-text-3"> · {s.reason ?? 'No reason'}{s.cascaded ? ' (moved by a predecessor)' : ''} · {formatDateTime(s.shifted_at, ctx.tz)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <CommentThread jobId={item.job_id} recordType="schedule_item" recordId={id} mode={mode} path={`/schedule/${id}`} canShareWithClient={false} />
    </div>
  )
}
