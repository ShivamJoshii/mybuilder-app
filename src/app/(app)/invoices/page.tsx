import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DollarSign, Plus } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCAD, formatDate, todayIn } from '@/lib/utils'
import { INVOICE_STATUS } from '@/lib/estimate'
import { forJobs } from '@/lib/job-filter'

export const metadata: Metadata = { title: 'Invoices' }

export default async function InvoicesPage() {
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'sub') redirect('/summary')
  if (mode === 'builder' && !can(ctx, 'invoices')) redirect('/summary?denied=invoices')
  const picked = mode === 'client' ? ctx.jobs : selectedJobs(ctx)
  const supabase = await createClient()
  const { data: invs } = picked.length ? await forJobs(supabase.from('client_invoices').select('id,number,title,status,invoice_date,due_date,job_id')
    , ctx, picked.map((j) => j.id)).is('deleted_at', null).order('invoice_date', { ascending: false }).order('number', { ascending: false }) : { data: [] }
  const totals = await Promise.all((invs ?? []).map(async (i) => [i.id, (await supabase.rpc('invoice_totals', { p: i.id })).data?.[0]] as const))
  const T = new Map(totals)
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  const today = todayIn(ctx.tz)
  const open = (invs ?? []).filter((i) => i.status === 'released')
  const outstanding = open.reduce((s, i) => s + Number(T.get(i.id)?.balance ?? 0), 0)
  const canAdd = mode === 'builder' && can(ctx, 'invoices', 'add')
  return (
    <>
      <PageHeader title={mode === 'client' ? 'Invoices' : 'Client invoices'} jobName={mode === 'builder' ? selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length) : null}
        actions={canAdd && <Button asChild variant="primary"><Link href="/invoices/new"><Plus />New invoice</Link></Button>} />
      {mode === 'builder' && picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="space-y-3 p-5">
        {outstanding > 0 && <div className="text-[13px] text-text-2">Outstanding: <span className="font-semibold tabular-nums">{formatCAD(outstanding)}</span> on {open.length} {open.length === 1 ? 'invoice' : 'invoices'}</div>}
        {(invs ?? []).length === 0 ? (
          <EmptyState icon={DollarSign} title={mode === 'client' ? 'No invoices yet' : 'Bill your clients'} body={mode === 'client' ? 'Invoices from your builder show up here.' : 'Progress draws by % of contract, fixed amounts and approved change orders, with GST/HST and holdback.'}
            action={canAdd ? <Button asChild variant="primary"><Link href="/invoices/new"><Plus />New invoice</Link></Button> : undefined} />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="w-12 px-4 py-2">#</th><th className="px-4 py-2">Title</th><th className="px-4 py-2">Job</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Dated</th><th className="px-4 py-2">Due</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Balance</th></tr></thead>
              <tbody className="divide-y divide-border">
                {(invs ?? []).map((i) => {
                  const t = T.get(i.id)
                  const overdue = i.status === 'released' && i.due_date && i.due_date < today
                  return (
                    <tr key={i.id}>
                      <td className="px-4 py-2 text-text-3">{i.number}</td>
                      <td className="px-4 py-2"><Link href={`/invoices/${i.id}`} className="font-medium text-brand hover:underline">{i.title}</Link></td>
                      <td className="px-4 py-2">{jobName.get(i.job_id)}</td>
                      <td className="px-4 py-2"><Badge tone={overdue ? 'danger' : INVOICE_STATUS[i.status].tone}>{overdue ? 'Overdue' : INVOICE_STATUS[i.status].label}</Badge></td>
                      <td className="px-4 py-2">{formatDate(i.invoice_date)}</td>
                      <td className="px-4 py-2">{i.due_date ? formatDate(i.due_date) : ''}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{t ? formatCAD(Number(t.total)) : ''}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{t && i.status !== 'void' ? formatCAD(Number(t.balance)) : ''}</td>
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
