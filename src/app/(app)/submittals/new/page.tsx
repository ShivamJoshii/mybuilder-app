import type { Metadata } from 'next'
import { requireBuilder, selectedJobs } from '@/lib/context'
import { linkedSubs, teamAndSubs } from '@/lib/financial'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { SubmittalForm } from '../submittal-form'
import { createSubmittal } from '../actions'

export const metadata: Metadata = { title: 'New submittal' }

export default async function NewSubmittalPage() {
  const ctx = await requireBuilder('submittals', 'add')
  const picked = selectedJobs(ctx)
  const [subs, people] = await Promise.all([linkedSubs(ctx.workspace.orgId), teamAndSubs(ctx.workspace.orgId)])
  return (
    <>
      <PageHeader title="New submittal" />
      <div className="mx-auto max-w-3xl p-5">
        <Card className="p-5">
          <SubmittalForm action={createSubmittal} jobs={ctx.jobs} subs={subs} team={people.filter((p) => p.group === 'Team').map((p) => ({ value: p.value.slice(2), label: p.label }))} isNew
            defaults={{ job_id: picked.length === 1 ? picked[0].id : '', title: '', spec_section: '', kind: 'shop_drawing', description: '', submitter: '', reviewer: ctx.userId, due_date: '', required_on_site: '' }} />
        </Card>
      </div>
    </>
  )
}
