import type { Metadata } from 'next'
import { requireBuilder, selectedJobs } from '@/lib/context'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { todayIn } from '@/lib/utils'
import { InvoiceForm } from '../invoice-form'
import { createInvoice } from '../actions'

export const metadata: Metadata = { title: 'New invoice' }

export default async function NewInvoicePage() {
  const ctx = await requireBuilder('invoices', 'add')
  const picked = selectedJobs(ctx)
  const due = new Date(Date.parse(todayIn(ctx.tz)) + 15 * 86_400_000).toISOString().slice(0, 10)
  return (
    <>
      <PageHeader title="New client invoice" />
      <div className="mx-auto max-w-3xl p-5">
        <Card className="p-5">
          <InvoiceForm action={createInvoice} jobs={ctx.jobs} submitLabel="Create invoice"
            defaults={{ job_id: picked.length === 1 ? picked[0].id : '', title: '', description: '', invoice_date: todayIn(ctx.tz), due_date: due, holdback_pct: 0 }} />
        </Card>
      </div>
    </>
  )
}
