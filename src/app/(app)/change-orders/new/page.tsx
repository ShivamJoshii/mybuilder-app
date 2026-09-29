import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { createChangeOrder } from '../actions'

export const metadata: Metadata = { title: 'New change order' }

export default async function NewChangeOrderPage() {
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'sub') redirect('/summary')
  let jobs = ctx.jobs
  if (mode === 'builder') {
    if (!can(ctx, 'change_orders', 'add')) redirect('/change-orders')
  } else {
    const supabase = await createClient()
    const ok = await Promise.all(ctx.jobs.map((j) => supabase.rpc('client_can', { p_job: j.id, p_key: 'submit_change_orders' })))
    jobs = ctx.jobs.filter((_, i) => ok[i].data === true)
    if (!jobs.length) redirect('/change-orders')
  }
  const picked = mode === 'builder' ? selectedJobs(ctx) : []
  const def = picked.length === 1 ? picked[0].id : jobs.length === 1 ? jobs[0].id : ''

  return (
    <>
      <PageHeader title={mode === 'client' ? 'Request a change' : 'New change order'} />
      <div className="mx-auto max-w-2xl p-5">
        <Card className="p-5">
          <ActionForm action={createChangeOrder} className="space-y-4">
            <Field label="Job" htmlFor="job_id" required>
              <Select id="job_id" name="job_id" defaultValue={def} required>
                <option value="" disabled>Pick a job</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </Select>
            </Field>
            <Field label="Title" htmlFor="title" required><Input id="title" name="title" required maxLength={200} /></Field>
            <Field label={mode === 'client' ? 'What would you like to change?' : 'Description (client sees this)'} htmlFor="description">
              <Textarea id="description" name="description" rows={4} maxLength={8000} />
            </Field>
            {mode === 'builder' && <Field label="Internal notes" htmlFor="internal_notes"><Textarea id="internal_notes" name="internal_notes" rows={3} maxLength={8000} /></Field>}
            <Button type="submit" variant="primary">{mode === 'client' ? 'Send request' : 'Create change order'}</Button>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}
