import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireBuilder, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Certificates } from '@/components/kit/certificates'

export const metadata: Metadata = { title: 'Sub or vendor' }

export default async function SubPage({ params }: PageProps<'/settings/subs/[id]'>) {
  const { id } = await params
  const ctx = await requireBuilder('subs_vendors')
  const supabase = await createClient()
  const { data: l } = await supabase.from('builder_sub_links').select('*').eq('id', id).eq('builder_org_id', ctx.workspace.orgId).maybeSingle()
  if (!l) notFound()
  const { data: jobs } = await supabase.from('job_subs').select('jobs!inner(id,title,org_id)').eq('sub_org_id', l.sub_org_id).eq('jobs.org_id', ctx.workspace.orgId)
  return (
    <>
      <PageHeader title={l.company_name} actions={<Button asChild variant="ghost"><Link href="/settings/subs"><ArrowLeft />Subs and vendors</Link></Button>} />
      <div className="max-w-5xl space-y-5 p-5">
        <Card className="grid gap-3 p-4 text-[13px] sm:grid-cols-3">
          <div><div className="text-xs text-text-3">Trade</div>{l.trade || '—'}</div>
          <div><div className="text-xs text-text-3">Contact</div>{[l.primary_contact_first, l.primary_contact_last].filter(Boolean).join(' ') || '—'}<div className="text-text-3">{[l.primary_email, l.business_phone].filter(Boolean).join(' · ')}</div></div>
          <div><div className="text-xs text-text-3">Status</div><Badge tone={l.status === 'active' ? 'success' : l.status === 'pending' ? 'warning' : 'neutral'}>{l.status === 'pending' ? 'Awaiting their OK' : l.status}</Badge></div>
          <div className="sm:col-span-3"><div className="text-xs text-text-3">Jobs</div>{(jobs ?? []).map((j) => {
            const job = j.jobs as unknown as { id: string; title: string }
            return <Link key={job.id} href={`/jobs/${job.id}`} className="mr-3 text-brand hover:underline">{job.title}</Link>
          })}{!(jobs ?? []).length && <span className="text-text-3">Not on any jobs yet</span>}</div>
        </Card>
        <Certificates builderId={ctx.workspace.orgId} subId={l.sub_org_id} uploaderOrgId={ctx.workspace.orgId} canEdit={can(ctx, 'subs_vendors', 'edit')} path={`/settings/subs/${id}`} tz={ctx.tz} />
      </div>
    </>
  )
}
