import type { Metadata } from 'next'
import { requireBuilder, selectedJobs } from '@/lib/context'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { createBidPackage } from '../actions'
import { tzLabel } from '@/lib/utils'

export const metadata: Metadata = { title: 'New bid package' }

export default async function NewBidPage() {
  const ctx = await requireBuilder('bids', 'add')
  const picked = selectedJobs(ctx)
  return (
    <>
      <PageHeader title="New bid package" />
      <div className="mx-auto max-w-2xl p-5">
        <Card className="p-5">
          <ActionForm action={createBidPackage} className="space-y-4">
            <Field label="Job" htmlFor="job_id" required>
              <Select id="job_id" name="job_id" defaultValue={picked.length === 1 ? picked[0].id : ''} required>
                <option value="" disabled>Pick a job</option>
                {ctx.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </Select>
            </Field>
            <Field label="Title" htmlFor="title" required><Input id="title" name="title" required maxLength={200} placeholder="e.g. Framing labour" /></Field>
            <Field label="Bids due" htmlFor="due" hint={`${tzLabel(ctx.tz)}. Subs can't submit after this.`}><Input id="due" name="due" type="datetime-local" /></Field>
            <Field label="Scope of work" htmlFor="scope"><Textarea id="scope" name="scope" rows={6} maxLength={20000} /></Field>
            <Button type="submit" variant="primary">Create bid package</Button>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}
