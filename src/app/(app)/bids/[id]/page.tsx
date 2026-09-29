import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Award, Send, XCircle } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { linkedSubs, costCodes } from '@/lib/financial'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ActionForm } from '@/components/kit/action-form'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { LinesEditor, type Line } from '@/components/kit/lines-editor'
import { Attachments } from '@/components/kit/attachments'
import { cn, formatCAD, formatDateTime, utcToZonedInput } from '@/lib/utils'
import { BID_REQUEST_STATUS, BID_STATUS } from '@/lib/estimate'
import { PricingForm } from './pricing-form'
import { awardBid, declineBid, releaseBids, saveBidLines, setInvites, submitBid, updateBidPackage } from '../actions'

export const metadata: Metadata = { title: 'Bid package' }

export default async function BidPage({ params }: PageProps<'/bids/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: p } = await supabase.from('bid_packages').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!p) notFound()
  const [{ data: items }, { data: reqs }, { data: info }] = await Promise.all([
    supabase.from('bid_package_items').select('*').eq('package_id', id).order('sort'),
    supabase.from('bid_requests').select('id,sub_org_id,status,total,notes,decline_reason,submitted_at,organizations(name)').eq('package_id', id).order('created_at'),
    supabase.rpc('bid_job_info', { p_package: id }),
  ])
  const job = info?.[0]
  const builder = ctx.workspace.mode === 'builder'
  const canEdit = builder && can(ctx, 'bids', 'edit')
  const st = BID_STATUS[p.status]
  const its = (items ?? []).map((i) => ({ ...i, quantity: Number(i.quantity) }))
  const due = p.due_at ? formatDateTime(p.due_at) : null
  const pastDue = p.due_at ? new Date(p.due_at).getTime() < new Date().getTime() : false

  const header = (
    <Card className="p-5">
      <div className="text-[13px] text-text-3">{job?.builder_name} · {job?.job_title}{job?.city ? `, ${job.city}` : ''} · Bid package #{p.number}</div>
      <h1 className="text-xl font-semibold">{p.title}</h1>
      <div className="mt-2 flex flex-wrap gap-2 text-[13px]"><Badge tone={st.tone}>{st.label}</Badge>{due && <Badge tone={pastDue && p.status === 'open' ? 'danger' : 'neutral'}>Due {due}</Badge>}</div>
      {p.scope && <p className="mt-3 whitespace-pre-wrap text-[14px]">{p.scope}</p>}
    </Card>
  )

  // ------------------------------------------------------------------ Sub view
  if (!builder) {
    const mine = (reqs ?? [])[0]
    if (!mine) notFound()
    const { data: myPrices } = await supabase.from('bid_request_prices').select('item_id,unit_cost,notes').eq('request_id', mine.id)
    const prices = Object.fromEntries((myPrices ?? []).map((x) => [x.item_id, { unit_cost: Number(x.unit_cost), notes: x.notes }]))
    const open = p.status === 'open' && ['invited', 'submitted'].includes(mine.status) && !pastDue
    const rs = BID_REQUEST_STATUS[mine.status]
    return (
      <div className="mx-auto max-w-4xl space-y-5 p-5">
        <Button asChild variant="ghost"><Link href="/bids"><ArrowLeft />Bid requests</Link></Button>
        {header}
        <Alert tone={mine.status === 'awarded' ? 'success' : mine.status === 'declined' || mine.status === 'not_awarded' ? 'danger' : 'info'}>
          Your bid: <span className="font-medium">{rs.label}</span>{mine.total != null ? ` · ${formatCAD(Number(mine.total))}` : ''}
          {mine.status === 'awarded' ? ' — you won this work. A purchase order will follow.' : ''}
        </Alert>
        <Card className="p-4">
          <PricingForm action={submitBid.bind(null, mine.id, id)} items={its} prices={prices} notes={mine.notes ?? ''} open={open} />
        </Card>
        {open && (
          <Card>
            <CardHeader title="Not bidding?" description="Let the builder know so they can plan." />
            <form action={declineBid.bind(null, mine.id, id)} className="flex flex-wrap items-end gap-2 p-4">
              <Input name="reason" aria-label="Reason" placeholder="Reason (optional)" className="max-w-md" maxLength={2000} />
              <Button type="submit"><XCircle />Decline to bid</Button>
            </form>
          </Card>
        )}
      </div>
    )
  }

  // ------------------------------------------------------------------ Builder view
  const draft = p.status === 'draft'
  const [codes, subs] = await Promise.all([costCodes(p.org_id), linkedSubs(p.org_id)])
  const invited = new Set((reqs ?? []).map((r) => r.sub_org_id))
  const { data: allPrices } = (reqs ?? []).length ? await supabase.from('bid_request_prices').select('request_id,item_id,unit_cost,notes').in('request_id', (reqs ?? []).map((r) => r.id)) : { data: [] }
  const price = (req: string, item: string) => (allPrices ?? []).find((x) => x.request_id === req && x.item_id === item)
  const submitted = (reqs ?? []).filter((r) => r.total != null)
  const low = submitted.length ? Math.min(...submitted.map((r) => Number(r.total))) : null

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost"><Link href="/bids"><ArrowLeft />Bids</Link></Button>
        {draft && canEdit && (
          <form action={releaseBids.bind(null, id)}>
            <ConfirmSubmit variant="primary" title="Send bid requests?" confirmLabel="Send" body="Invited subs and vendors are notified and can submit prices until the deadline. Lines are locked once sent."><Send />Send to bidders</ConfirmSubmit>
          </form>
        )}
      </div>
      {header}
      {draft && canEdit && (
        <Card>
          <CardHeader title="Details" />
          <ActionForm action={updateBidPackage.bind(null, id)} resetOnSuccess={false} className="grid gap-3 p-4 sm:grid-cols-2">
            <label className="text-[13px] font-medium text-text-2">Title<Input name="title" className="mt-1" defaultValue={p.title} required maxLength={200} /></label>
            <label className="text-[13px] font-medium text-text-2">Bids due (Mountain time)<Input name="due" type="datetime-local" className="mt-1" defaultValue={utcToZonedInput(p.due_at)} /></label>
            <label className="text-[13px] font-medium text-text-2 sm:col-span-2">Scope of work<Textarea name="scope" className="mt-1" rows={4} defaultValue={p.scope ?? ''} maxLength={20000} /></label>
            <div><Button type="submit">Save details</Button></div>
          </ActionForm>
        </Card>
      )}
      {draft && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Lines to price</h2>
          <LinesEditor initial={its as Line[]} codes={codes} withCost={false} editable={canEdit} save={saveBidLines.bind(null, id)} />
        </div>
      )}
      {canEdit && p.status !== 'awarded' && (
        <Card>
          <CardHeader title="Bidders" description={subs.length ? 'Pick the subs and vendors to invite.' : 'Add subs and vendors in Settings first.'} />
          <form action={setInvites.bind(null, id)} className="space-y-3 p-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {subs.map((s) => (
                <label key={s.sub_org_id} className="flex items-center gap-2 text-[13px]">
                  <Checkbox name="sub" value={s.sub_org_id} defaultChecked={invited.has(s.sub_org_id)} /> {s.company_name}{s.trade ? <span className="text-text-3"> · {s.trade}</span> : null}
                </label>
              ))}
            </div>
            {subs.length > 0 && <Button type="submit" size="sm">Save bidders</Button>}
          </form>
        </Card>
      )}
      {!draft && (
        <Card className="overflow-x-auto">
          <CardHeader title="Compare bids" description={`${submitted.length} of ${(reqs ?? []).length} bidders have submitted.`} />
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-surface-2 text-left text-xs text-text-3">
              <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th>
                {(reqs ?? []).map((r) => <th key={r.id} className="px-3 py-2 text-right">{(r.organizations as { name: string } | null)?.name}<div><Badge tone={BID_REQUEST_STATUS[r.status].tone}>{BID_REQUEST_STATUS[r.status].label}</Badge></div></th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {its.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2">{i.title}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{i.quantity} {i.unit}</td>
                  {(reqs ?? []).map((r) => {
                    const x = price(r.id, i.id)
                    return <td key={r.id} className="px-3 py-2 text-right tabular-nums">{x ? <>{formatCAD(i.quantity * Number(x.unit_cost))}<div className="text-xs text-text-3">{formatCAD(Number(x.unit_cost))}/{i.unit}</div>{x.notes && <div className="text-xs text-text-3">{x.notes}</div>}</> : '—'}</td>
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="px-3 py-2" colSpan={2}>Total</td>
                {(reqs ?? []).map((r) => (
                  <td key={r.id} className={cn('px-3 py-2 text-right tabular-nums', r.total != null && Number(r.total) === low && 'text-success')} data-testid={`bid-total-${(r.organizations as { name: string } | null)?.name}`}>
                    {r.total != null ? formatCAD(Number(r.total)) : r.status === 'declined' ? 'Declined' : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td colSpan={2} />
                {(reqs ?? []).map((r) => (
                  <td key={r.id} className="px-3 py-2 text-right align-top text-xs text-text-3">
                    {r.notes && <p className="mb-2 whitespace-pre-wrap text-left">{r.notes}</p>}
                    {r.decline_reason && <p className="mb-2 text-left">“{r.decline_reason}”</p>}
                    {canEdit && p.status === 'open' && r.status === 'submitted' && can(ctx, 'purchase_orders', 'add') && (
                      <form action={awardBid.bind(null, r.id)}>
                        <ConfirmSubmit size="sm" variant="primary" title={`Award to ${(r.organizations as { name: string } | null)?.name}?`} confirmLabel="Award"
                          body="The other bidders are marked not awarded, and a draft purchase order is created at this bid's prices."><Award />Award</ConfirmSubmit>
                      </form>
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
      <Attachments jobId={p.job_id} recordType="bid_package" recordId={id} path={`/bids/${id}`} share={{ subs: true, clients: false }} canAdd={canEdit} />
    </div>
  )
}
