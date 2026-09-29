import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Hammer } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchAssignable } from '@/lib/todos'
import { linkableRecords } from '@/lib/related'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { RfiForm } from './rfi-form'
import { isoDaysFromNow } from '@/lib/utils'

export const metadata: Metadata = { title: 'New RFI' }

export default async function NewRfiPage() {
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'client' || (mode === 'builder' && !can(ctx, 'rfis', 'add'))) redirect('/rfis')
  const jobs = ctx.jobs.filter((j) => j.status !== 'closed')
  if (jobs.length === 0) return <div className="p-5"><Card><EmptyState icon={Hammer} title="No open jobs" body="RFIs belong to a job." /></Card></div>
  const ids = jobs.map((j) => j.id)

  let assignees: Record<string, { value: string; label: string; group: string }[]> = {}
  if (mode === 'builder') {
    const all = await fetchAssignable(ctx.workspace.orgId, ids)
    // RFIs go to staff or subs, not clients
    assignees = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.filter((o) => o.group !== 'Clients')]))
  } else {
    // Subs: their own company, plus other subs only where the builder allowed it
    const supabase = await createClient()
    const { data: mine } = await supabase.from('job_subs').select('job_id,sub_org_id,can_assign_rfis_to_subs').in('job_id', ids)
    const myOrgs = new Set(ctx.orgs.filter((o) => o.kind === 'sub').map((o) => o.org_id))
    for (const j of ids) {
      const rows = (mine ?? []).filter((r) => r.job_id === j && myOrgs.has(r.sub_org_id))
      assignees[j] = rows.map((r) => ({ value: `s:${r.sub_org_id}`, label: ctx.orgs.find((o) => o.org_id === r.sub_org_id)?.name ?? 'My company', group: 'My company' }))
    }
  }
  const picked = selectedJobs(ctx)
  return <RfiForm jobs={jobs.map((j) => ({ id: j.id, title: j.title }))} assignees={assignees} targets={await linkableRecords(ids)}
    defaultJob={picked.length === 1 ? picked[0].id : undefined}
    defaultDue={isoDaysFromNow(7)} />
}
