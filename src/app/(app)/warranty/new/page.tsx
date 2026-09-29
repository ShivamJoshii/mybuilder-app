import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { teamAndSubs } from '@/lib/financial'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { CLAIM_CATEGORIES } from '@/lib/warranty'
import { createClaim } from '../actions'

export const metadata: Metadata = { title: 'New warranty claim' }

export default async function NewClaimPage() {
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'sub') redirect('/warranty')
  if (mode === 'builder' && !can(ctx, 'warranties', 'add')) redirect('/warranty')
  const picked = mode === 'builder' ? selectedJobs(ctx) : ctx.jobs
  const people = mode === 'builder' ? await teamAndSubs(ctx.workspace.orgId) : []
  return (
    <>
      <PageHeader title={mode === 'client' ? 'Request warranty service' : 'New warranty claim'} />
      <div className="mx-auto max-w-2xl p-5">
        <Card className="p-5">
          <ActionForm action={createClaim} className="space-y-4">
            <Field label="Job" htmlFor="job_id" required>
              <Select id="job_id" name="job_id" defaultValue={picked.length === 1 ? picked[0].id : ''} required>
                <option value="" disabled>Pick a job</option>
                {ctx.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </Select>
            </Field>
            <Field label="What’s wrong?" htmlFor="title" required><Input id="title" name="title" required maxLength={200} placeholder="e.g. Kitchen tap drips" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="category"><Input id="category" name="category" list="claim-cats" maxLength={60} /><datalist id="claim-cats">{CLAIM_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></Field>
              <Field label="Where in the home?" htmlFor="location"><Input id="location" name="location" maxLength={80} placeholder="e.g. Kitchen" /></Field>
            </div>
            <Field label="Details" htmlFor="description"><Textarea id="description" name="description" rows={4} maxLength={8000} placeholder="When did it start? Anything we should know to get in?" /></Field>
            <Field label="Priority" htmlFor="priority">
              <Select id="priority" name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="urgent">Urgent (water, heat, safety)</option></Select>
            </Field>
            {mode === 'builder' && (
              <Field label="Assign to" htmlFor="assignee">
                <Select id="assignee" name="assignee" defaultValue=""><option value="">Nobody yet</option>
                  {['Team', 'Subs and vendors'].map((g) => <optgroup key={g} label={g}>{people.filter((p) => p.group === g).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</optgroup>)}
                </Select>
              </Field>
            )}
            <Button type="submit" variant="primary">{mode === 'client' ? 'Send request' : 'Create claim'}</Button>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}
