import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, Settings2, Trash2 } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { ActionForm } from '@/components/kit/action-form'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { formatDate, fullName } from '@/lib/utils'
import { PlanViewer, type Markup, type Shape, type Version } from './plan-viewer'
import { NewVersion } from './new-version'
import { deleteSheet, updateSheet } from '../actions'

export const metadata: Metadata = { title: 'Plan sheet' }
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export default async function SheetPage({ params }: PageProps<'/plans/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: sheet } = await supabase.from('plan_sheets').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!sheet) notFound()
  const builder = ctx.workspace.mode === 'builder'
  const canEdit = builder && can(ctx, 'specs', 'edit')
  const canDelete = builder && can(ctx, 'specs', 'delete')
  const [{ data: versions }, { data: markups }, { data: siblings }] = await Promise.all([
    supabase.from('plan_sheet_versions').select('id,version,page,mime,note,created_at').eq('sheet_id', id).eq('status', 'ready').order('version'),
    supabase.from('plan_markups').select('version,author_id,visibility,shapes,profiles(first_name,last_name,email)').eq('sheet_id', id),
    supabase.from('plan_sheets').select('id,number').eq('job_id', sheet.job_id).is('deleted_at', null),
  ])
  const order = [...(siblings ?? [])].sort((a, b) => natural.compare(a.number, b.number))
  const idx = order.findIndex((s) => s.id === id)
  const prev = order[idx - 1], next = order[idx + 1]
  const job = ctx.jobs.find((j) => j.id === sheet.job_id)
  const vs = (versions ?? []) as Version[]
  const ms: Markup[] = (markups ?? []).map((m) => ({
    version: m.version, mine: m.author_id === ctx.userId, visibility: m.visibility, shapes: m.shapes as Shape[],
    author: fullName(m.profiles as { first_name: string; last_name: string; email: string } | null) || 'Someone',
  }))
  const cur = vs.find((v) => v.version === sheet.current_version) ?? vs[vs.length - 1]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <Button asChild variant="ghost" size="sm"><Link href={job ? '/plans' : '/bids'}><ArrowLeft />{job ? 'Plans' : 'Bids'}</Link></Button>
        <div className="min-w-0">
          <div className="text-xs text-text-3">{job?.title}{sheet.discipline ? ` · ${sheet.discipline}` : ''}</div>
          <h1 className="truncate text-base font-semibold">{sheet.number}{sheet.title ? ` — ${sheet.title}` : ''}</h1>
        </div>
        <Badge>v{sheet.current_version}</Badge>
        {cur?.note && <span className="text-xs text-text-3">“{cur.note}” · {formatDate(cur.created_at)}</span>}
        <div className="ml-auto flex items-center gap-1">
          {prev ? <Button asChild variant="ghost" size="sm" aria-label="Previous sheet"><Link href={`/plans/${prev.id}`}><ChevronLeft />{prev.number}</Link></Button> : null}
          {next ? <Button asChild variant="ghost" size="sm" aria-label="Next sheet"><Link href={`/plans/${next.id}`}>{next.number}<ChevronRight /></Link></Button> : null}
          {canEdit && <NewVersion sheetId={id} next={(vs[vs.length - 1]?.version ?? 0) + 1} />}
          {canEdit && (
            <Dialog>
              <DialogTrigger asChild><Button aria-label="Sheet settings"><Settings2 /></Button></DialogTrigger>
              <DialogContent title="Sheet settings">
                <ActionForm action={updateSheet.bind(null, id)} resetOnSuccess={false} className="space-y-3 p-4">
                  <label className="block text-[13px] font-medium text-text-2">Sheet number<Input name="number" className="mt-1" defaultValue={sheet.number} required maxLength={30} /></label>
                  <label className="block text-[13px] font-medium text-text-2">Title<Input name="title" className="mt-1" defaultValue={sheet.title} maxLength={200} /></label>
                  <label className="block text-[13px] font-medium text-text-2">Discipline<Input name="discipline" className="mt-1" defaultValue={sheet.discipline ?? ''} maxLength={40} /></label>
                  <label className="flex items-center gap-2 text-[13px]"><Checkbox name="share_subs" defaultChecked={sheet.share_subs} /> Share with subs on the job</label>
                  <label className="flex items-center gap-2 text-[13px]"><Checkbox name="share_clients" defaultChecked={sheet.share_clients} /> Share with the client</label>
                  <Button type="submit" variant="primary">Save sheet</Button>
                </ActionForm>
              </DialogContent>
            </Dialog>
          )}
          {canDelete && <form action={deleteSheet.bind(null, id)}><ConfirmSubmit variant="ghost" aria-label="Delete sheet" title="Delete this sheet?" body="The sheet and its versions move to the trash."><Trash2 /></ConfirmSubmit></form>}
        </div>
      </div>
      {vs.length === 0 ? <p className="p-5 text-[13px] text-text-3">This sheet is still uploading.</p> : (
        <PlanViewer sheetId={id} versions={vs} currentVersion={cur.version} markups={ms} canTeam={builder} />
      )}
    </div>
  )
}
