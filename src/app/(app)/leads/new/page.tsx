import type { Metadata } from 'next'
import { requireBuilder } from '@/lib/context'
import { fetchLookups } from '@/lib/leads'
import { LeadForm } from '../lead-form'
import { createLead } from '../actions'

export const metadata: Metadata = { title: 'New lead' }

export default async function NewLeadPage() {
  const ctx = await requireBuilder('leads', 'add')
  const l = await fetchLookups(ctx.workspace.orgId)
  return <LeadForm title="New lead opportunity" action={createLead} cancelHref="/leads" statuses={l.statuses} sources={l.sources} types={l.types}
    salespeople={l.salespeople} me={ctx.userId} saveLabel="Create lead" />
}
