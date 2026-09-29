import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, ShieldCheck } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'
import { CLAIM_STATUS, PRIORITY } from '@/lib/warranty'

export const metadata: Metadata = { title: 'Warranty' }

export default async function WarrantyPage({ searchParams }: PageProps<'/warranty'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'builder' && !can(ctx, 'warranties')) redirect('/summary?denied=warranties')
  const status = typeof sp.status === 'string' && sp.status in CLAIM_STATUS ? sp.status : ''
  const supabase = await createClient()
  const picked = mode === 'builder' ? selectedJobs(ctx) : []
  let q = supabase.from('warranty_claims').select('id,number,title,status,priority,category,created_at,submitted_by_client,job_id,assignee:profiles!warranty_claims_assignee_user_id_fkey(first_name,last_name),assignee_org:organizations!warranty_claims_assignee_sub_org_id_fkey(name),jobs(title),warranty_appointments(starts_at,status)')
    .is('deleted_at', null).order('created_at', { ascending: false })
  if (mode === 'builder') q = q.in('job_id', picked.map((j) => j.id))
  if (status) q = q.eq('status', status as 'open')
  const { data: claims } = mode === 'builder' && !picked.length ? { data: [] } : await q
  const canAdd = mode === 'builder' ? can(ctx, 'warranties', 'add') : mode === 'client'
  const now = new Date().toISOString()
  return (
    <>
      <PageHeader title="Warranty" jobName={mode === 'builder' ? selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length) : null}
        actions={canAdd && <Button asChild variant="primary"><Link href="/warranty/new"><Plus />{mode === 'client' ? 'Request warranty service' : 'New claim'}</Link></Button>} />
      {mode === 'builder' && picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap gap-1 text-[13px]">
          {[['', 'All'], ...Object.entries(CLAIM_STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
            <Link key={k} href={k ? `/warranty?status=${k}` : '/warranty'} className={`rounded-full border px-3 py-1 ${status === k ? 'border-brand bg-brand-soft text-brand' : 'border-border text-text-2'}`}>{l}</Link>
          ))}
        </div>
        {(claims ?? []).length === 0 ? (
          <EmptyState icon={ShieldCheck} title={mode === 'client' ? 'Something not right?' : 'Handle warranty claims'}
            body={mode === 'client' ? 'Tell your builder what needs fixing. They’ll book a service visit.' : mode === 'sub' ? 'Warranty work assigned to your company shows up here.' : 'Claims from homeowners, service appointments with your trades, and feedback when it’s fixed.'}
            action={canAdd ? <Button asChild variant="primary"><Link href="/warranty/new"><Plus />{mode === 'client' ? 'Request warranty service' : 'New claim'}</Link></Button> : undefined} />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="w-12 px-4 py-2">#</th><th className="px-4 py-2">Issue</th><th className="px-4 py-2">Job</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Priority</th><th className="px-4 py-2">Assigned</th><th className="px-4 py-2">Next visit</th><th className="px-4 py-2">Reported</th></tr></thead>
              <tbody className="divide-y divide-border">
                {(claims ?? []).map((c) => {
                  const next = (c.warranty_appointments ?? []).filter((a) => a.starts_at >= now && !['cancelled', 'completed'].includes(a.status)).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-2 text-text-3">{c.number}</td>
                      <td className="px-4 py-2"><Link href={`/warranty/${c.id}`} className="font-medium text-brand hover:underline">{c.title}</Link>{c.category && <div className="text-xs text-text-3">{c.category}</div>}</td>
                      <td className="px-4 py-2">{(c.jobs as { title: string } | null)?.title}</td>
                      <td className="px-4 py-2"><Badge tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].label}</Badge></td>
                      <td className="px-4 py-2">{c.priority !== 'normal' && <Badge tone={PRIORITY[c.priority].tone}>{PRIORITY[c.priority].label}</Badge>}</td>
                      <td className="px-4 py-2">{(c.assignee_org as { name: string } | null)?.name ?? ((c.assignee as { first_name: string; last_name: string } | null) ? `${(c.assignee as { first_name: string }).first_name} ${(c.assignee as { last_name: string }).last_name}` : '')}</td>
                      <td className="px-4 py-2">{next ? formatDate(next.starts_at) : ''}</td>
                      <td className="px-4 py-2">{formatDate(c.created_at)}{c.submitted_by_client && <Badge className="ml-1">Client</Badge>}</td>
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
