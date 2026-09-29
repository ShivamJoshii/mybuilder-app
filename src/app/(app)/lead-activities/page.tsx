import type { Metadata } from 'next'
import Link from 'next/link'
import { ListChecks } from 'lucide-react'
import { requireBuilder, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { ACTIVITY_TYPES } from '@/lib/leads'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, formatDate, todayIn } from '@/lib/utils'
import { completeActivity } from '../leads/actions'

export const metadata: Metadata = { title: 'Lead activities' }

export default async function LeadActivitiesPage({ searchParams }: PageProps<'/lead-activities'>) {
  const sp = await searchParams
  const ctx = await requireBuilder('leads')
  const mine = sp.who !== 'all'
  const open = sp.show !== 'done'
  const supabase = await createClient()
  let q = supabase.from('lead_activities').select('id,type,title,activity_date,start_time,completed_at,lead_id,leads(title),assignee:profiles!lead_activities_assigned_to_fkey(first_name,last_name)')
    .eq('org_id', ctx.workspace.orgId).order('activity_date').limit(500)
  if (mine) q = q.eq('assigned_to', ctx.userId)
  q = open ? q.is('completed_at', null) : q.not('completed_at', 'is', null)
  const { data } = await q
  const today = todayIn(ctx.tz)
  const label = new Map<string, string>(ACTIVITY_TYPES.map((t) => [t.value, t.label]))
  const tab = (k: string, v: string, text: string, on: boolean) => {
    const p = new URLSearchParams(Object.entries(sp).flatMap(([a, b]) => (typeof b === 'string' ? [[a, b]] : [])))
    p.set(k, v)
    return <Link href={`/lead-activities?${p}`} className={cn('rounded-md px-2.5 py-1 text-[13px]', on ? 'bg-brand text-white' : 'hover:bg-surface-2')}>{text}</Link>
  }
  return (
    <>
      <PageHeader title="Lead activities" actions={<>
        <div className="flex rounded-md border border-border-strong p-0.5">{tab('who', 'me', 'Mine', mine)}{tab('who', 'all', 'Everyone', !mine)}</div>
        <div className="flex rounded-md border border-border-strong p-0.5">{tab('show', 'open', 'To do', open)}{tab('show', 'done', 'Done', !open)}</div>
      </>} />
      <div className="p-5">
        <Card>
          {(data ?? []).length === 0 ? <EmptyState icon={ListChecks} title={open ? 'Nothing to follow up on' : 'No completed activities'} body="Schedule calls, meetings and follow-ups from a lead." /> : (
            <ul className="divide-y divide-border">
              {(data ?? []).map((a) => {
                const late = !a.completed_at && a.activity_date < today
                const who = a.assignee as { first_name: string; last_name: string } | null
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    {can(ctx, 'leads', 'edit') && (
                      <form action={completeActivity.bind(null, a.id, a.lead_id, !a.completed_at)}>
                        <button type="submit" aria-label={a.completed_at ? 'Mark not done' : 'Mark done'} className={`size-4 rounded border ${a.completed_at ? 'border-success bg-success' : 'border-border-strong'}`} />
                      </form>
                    )}
                    <Badge>{label.get(a.type)}</Badge>
                    <div className="min-w-0 flex-1">
                      <Link href={`/leads/${a.lead_id}`} className="font-medium text-brand hover:underline">{(a.leads as { title: string } | null)?.title}</Link>
                      {a.title && <span className="text-text-2"> · {a.title}</span>}
                    </div>
                    {!mine && who && <span className="text-xs text-text-3">{who.first_name} {who.last_name}</span>}
                    <span className={cn('whitespace-nowrap text-xs', late ? 'font-medium text-danger' : 'text-text-3')}>{late ? 'Overdue · ' : ''}{formatDate(a.activity_date)}{a.start_time ? ` ${a.start_time.slice(0, 5)}` : ''}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
