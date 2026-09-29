import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireBuilder } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchLookups } from '@/lib/leads'
import { LeadForm } from '../../lead-form'
import { updateLead } from '../../actions'

export const metadata: Metadata = { title: 'Edit lead' }

export default async function EditLeadPage({ params }: PageProps<'/leads/[id]/edit'>) {
  const { id } = await params
  const ctx = await requireBuilder('leads', 'edit')
  const supabase = await createClient()
  const { data: lead } = await supabase.from('leads').select('*, lead_salespeople(user_id)').eq('id', id).maybeSingle()
  if (!lead) notFound()
  const l = await fetchLookups(ctx.workspace.orgId)
  const { lead_salespeople, ...rest } = lead
  return <LeadForm title={`Edit ${lead.title}`} action={updateLead.bind(null, id)} cancelHref={`/leads/${id}`} statuses={l.statuses} sources={l.sources}
    types={l.types} salespeople={l.salespeople} me={ctx.userId}
    values={{ ...rest, est_revenue_min: rest.est_revenue_min == null ? null : Number(rest.est_revenue_min), est_revenue_max: rest.est_revenue_max == null ? null : Number(rest.est_revenue_max),
      salespeople: (lead_salespeople ?? []).map((s: { user_id: string }) => s.user_id) }} />
}
