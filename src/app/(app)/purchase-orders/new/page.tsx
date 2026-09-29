import type { Metadata } from 'next'
import { requireBuilder, selectedJobs } from '@/lib/context'
import { linkedSubs } from '@/lib/financial'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { PoForm } from '../po-form'
import { createPo } from '../actions'

export const metadata: Metadata = { title: 'New purchase order' }

export default async function NewPoPage() {
  const ctx = await requireBuilder('purchase_orders', 'add')
  const picked = selectedJobs(ctx)
  const subs = await linkedSubs(ctx.workspace.orgId)
  return (
    <>
      <PageHeader title="New purchase order" />
      <div className="mx-auto max-w-3xl p-5">
        <Card className="p-5">
          <PoForm action={createPo} jobs={ctx.jobs} subs={subs} submitLabel="Create purchase order"
            defaults={{ job_id: picked.length === 1 ? picked[0].id : '', title: '', scope: '', payee: '', vendor_name: '', holdback_pct: 10, lien_waiver_required: false }} />
        </Card>
      </div>
    </>
  )
}
