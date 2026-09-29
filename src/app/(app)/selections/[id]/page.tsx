import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Check, CheckCircle2, Pencil, Send, Trash2, Unlock } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ActionForm } from '@/components/kit/action-form'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { Attachments } from '@/components/kit/attachments'
import { formatCAD, formatDate, todayIn } from '@/lib/utils'
import { SELECTION_STATUS } from '@/lib/selection'
import { addChoice, approveSelection, chooseSelection, deleteChoice, deleteSelection, releaseSelection, setChoiceAvailable, unlockSelection } from '../actions'

export const metadata: Metadata = { title: 'Selection' }

type Choice = { id: string; title: string; description: string | null; vendor: string | null; product_code: string | null; is_available: boolean; client_price?: number }

export default async function SelectionPage({ params }: PageProps<'/selections/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: s } = await supabase.from('selections').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!s) notFound()
  const mode = ctx.workspace.mode
  const builder = mode === 'builder'
  const canEdit = builder && can(ctx, 'selections', 'edit')
  const canDelete = builder && can(ctx, 'selections', 'delete')
  const seeCost = builder && can(ctx, 'selections', 'cost')
  const locked = s.status === 'approved'
  const open = s.status === 'pending' || s.status === 'selected'

  let choices: Choice[] = []
  if (mode === 'sub') choices = (await supabase.rpc('selection_choices_public', { p_sel: id })).data ?? []
  else choices = ((await supabase.from('selection_choices').select('id,title,description,vendor,product_code,is_available,client_price').eq('selection_id', id).order('sort')).data ?? [])
    .map((c) => ({ ...c, client_price: Number(c.client_price) }))
  if (mode === 'client') choices = choices.filter((c) => c.is_available || c.id === s.selected_choice_id)
  const { data: costs } = seeCost && choices.length ? await supabase.from('selection_choice_costs').select('choice_id,builder_cost').in('choice_id', choices.map((c) => c.id)) : { data: [] }
  const cost = new Map((costs ?? []).map((c) => [c.choice_id, Number(c.builder_cost)]))
  const job = ctx.jobs.find((j) => j.id === s.job_id)
  const st = SELECTION_STATUS[s.status]
  const allowance = s.allowance != null ? Number(s.allowance) : null
  const picked = choices.find((c) => c.id === s.selected_choice_id)
  const diff = picked?.client_price != null && allowance != null ? picked.client_price - allowance : null
  const overdue = s.deadline && s.deadline < todayIn() && (s.status === 'pending' || s.status === 'draft')
  const canChoose = open && ((mode === 'client' && s.share_client) || canEdit)

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost"><Link href="/selections"><ArrowLeft />Selections</Link></Button>
        <div className="flex flex-wrap gap-2">
          {canEdit && !locked && <Button asChild><Link href={`/selections/${id}/edit`}><Pencil />Edit</Link></Button>}
          {canDelete && !locked && <form action={deleteSelection.bind(null, id)}><ConfirmSubmit variant="ghost" title="Delete this selection?" body="It moves to the trash with its choices."><Trash2 />Delete</ConfirmSubmit></form>}
          {canEdit && s.status === 'draft' && (
            <form action={releaseSelection.bind(null, id)}><Button type="submit" variant="primary"><Send />Release{s.share_client ? ' to client' : ''}</Button></form>
          )}
          {canEdit && locked && <form action={unlockSelection.bind(null, id)}><ConfirmSubmit title="Unlock this selection?" confirmLabel="Unlock" body="The client's pick stays, but you can change choices again. Any change order already created is not affected."><Unlock />Unlock</ConfirmSubmit></form>}
        </div>
      </div>

      <Card className="p-5">
        <div className="text-[13px] text-text-3">{job?.title}{s.category ? ` · ${s.category}` : ''}{s.location ? ` · ${s.location}` : ''}</div>
        <h1 className="text-xl font-semibold">{s.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
          <Badge tone={st.tone}>{st.label}</Badge>
          {s.deadline && <Badge tone={overdue ? 'danger' : 'neutral'}>{overdue ? 'Overdue · ' : 'Choose by '}{formatDate(s.deadline)}</Badge>}
          {allowance != null && mode !== 'sub' && <Badge>Allowance {formatCAD(allowance)}</Badge>}
          {builder && s.share_client && <Badge>Client can choose</Badge>}
          {builder && s.share_subs && <Badge>Shared with subs</Badge>}
        </div>
        {s.instructions && <p className="mt-3 whitespace-pre-wrap text-[14px]">{s.instructions}</p>}
        {picked && (
          <Alert tone={locked ? 'success' : 'info'} className="mt-4">
            {locked ? 'Approved' : 'Selected'}: <span className="font-medium">{picked.title}</span>
            {picked.client_price != null && mode !== 'sub' && <> for {formatCAD(picked.client_price)}{diff != null && diff !== 0 && <> ({formatCAD(Math.abs(diff))} {diff > 0 ? 'over' : 'under'} the allowance)</>}</>}
          </Alert>
        )}
        {s.change_order_id && builder && <p className="mt-2 text-[13px]"><Link href={`/change-orders/${s.change_order_id}`} className="text-brand hover:underline">View the allowance change order</Link></p>}
      </Card>

      {canEdit && s.status === 'selected' && (
        <Card>
          <CardHeader title="Approve the selection" description="Approving locks the choice for ordering." />
          <form action={approveSelection.bind(null, id)} className="flex flex-wrap items-center gap-4 p-4">
            {diff != null && diff !== 0 && (
              <label className="flex items-center gap-2 text-[13px]"><Checkbox name="create_co" defaultChecked /> Create a change order for the {formatCAD(Math.abs(diff))} {diff > 0 ? 'overage' : 'credit'}</label>
            )}
            <Button type="submit" variant="primary"><CheckCircle2 />Approve selection</Button>
          </form>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {choices.map((c) => {
          const isPicked = c.id === s.selected_choice_id
          return (
            <Card key={c.id} className={`flex flex-col p-4 ${isPicked ? 'ring-2 ring-brand' : ''} ${!c.is_available ? 'opacity-60' : ''}`} data-choice={c.title}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{c.title}</h3>
                {isPicked && <Badge tone={locked ? 'success' : 'brand'}><Check className="mr-0.5 size-3" />{locked ? 'Approved' : 'Selected'}</Badge>}
                {!c.is_available && <Badge>Unavailable</Badge>}
              </div>
              {(c.vendor || c.product_code) && <div className="text-xs text-text-3">{[c.vendor, c.product_code].filter(Boolean).join(' · ')}</div>}
              {c.description && <p className="mt-2 whitespace-pre-wrap text-[13px] text-text-2">{c.description}</p>}
              <div className="mt-auto pt-3">
                {c.client_price != null && (
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-lg font-semibold tabular-nums">{formatCAD(c.client_price)}</span>
                    {allowance != null && <span className={c.client_price > allowance ? 'text-danger' : 'text-success'}>{c.client_price > allowance ? '+' : '−'}{formatCAD(Math.abs(c.client_price - allowance))}</span>}
                  </div>
                )}
                {seeCost && cost.has(c.id) && <div className="text-xs text-text-3">Builder cost {formatCAD(cost.get(c.id))}</div>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {canChoose && c.is_available && !isPicked && <form action={chooseSelection.bind(null, id, c.id)}><Button type="submit" size="sm" variant="primary">Choose this</Button></form>}
                  {canEdit && !locked && <form action={setChoiceAvailable.bind(null, id, c.id, !c.is_available)}><Button type="submit" size="sm" variant="ghost">{c.is_available ? 'Mark unavailable' : 'Mark available'}</Button></form>}
                  {canEdit && !locked && !isPicked && <form action={deleteChoice.bind(null, id, c.id)}><Button type="submit" size="sm" variant="ghost" aria-label={`Delete ${c.title}`}><Trash2 /></Button></form>}
                </div>
              </div>
            </Card>
          )
        })}
        {choices.length === 0 && <p className="text-[13px] text-text-3">No choices yet.</p>}
      </div>

      {canEdit && !locked && (
        <Card>
          <CardHeader title="Add a choice" />
          <ActionForm action={addChoice.bind(null, id)} className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="text-[13px] font-medium text-text-2 sm:col-span-2">Choice title<Input name="title" className="mt-1" required maxLength={200} /></label>
            <label className="text-[13px] font-medium text-text-2">Vendor<Input name="vendor" className="mt-1" maxLength={120} /></label>
            <label className="text-[13px] font-medium text-text-2">Product code<Input name="product_code" className="mt-1" maxLength={80} /></label>
            <label className="text-[13px] font-medium text-text-2">Client price<Input name="client_price" type="number" step="0.01" className="mt-1" required /></label>
            {seeCost && <label className="text-[13px] font-medium text-text-2">Builder cost<Input name="builder_cost" type="number" step="0.01" min="0" className="mt-1" /></label>}
            <label className="text-[13px] font-medium text-text-2 sm:col-span-2">Description<Textarea name="description" className="mt-1" rows={2} maxLength={4000} /></label>
            <div className="sm:col-span-2"><Button type="submit">Add choice</Button></div>
          </ActionForm>
        </Card>
      )}

      <Attachments jobId={s.job_id} recordType="selection" recordId={id} path={`/selections/${id}`} share={{ subs: s.share_subs, clients: s.share_client }} canAdd={canEdit} />
    </div>
  )
}
