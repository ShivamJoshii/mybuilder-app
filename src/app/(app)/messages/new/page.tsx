import type { Metadata } from 'next'
import { requireBuilder, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ActionForm } from '@/components/kit/action-form'
import { newMessage } from '../actions'

export const metadata: Metadata = { title: 'New message' }

export default async function NewMessagePage() {
  const ctx = await requireBuilder('messages', 'add')
  const picked = selectedJobs(ctx)
  const job = picked.length === 1 ? picked[0] : null
  const supabase = await createClient()
  // Quick picks: the job's clients and subs' contacts
  const [{ data: clients }, { data: subs }] = job ? await Promise.all([
    supabase.from('job_clients').select('first_name,last_name,email').eq('job_id', job.id).not('email', 'is', null),
    supabase.from('job_subs').select('sub_org_id').eq('job_id', job.id),
  ]) : [{ data: [] }, { data: [] }]
  const { data: links } = subs?.length ? await supabase.from('builder_sub_links').select('company_name,primary_email').eq('builder_org_id', ctx.workspace.orgId).in('sub_org_id', subs.map((s) => s.sub_org_id)) : { data: [] }
  const picks = [
    ...(clients ?? []).map((c) => ({ email: c.email!, label: `${c.first_name} ${c.last_name}`.trim(), group: 'Client' })),
    ...(links ?? []).filter((l) => l.primary_email).map((l) => ({ email: String(l.primary_email), label: l.company_name, group: 'Sub' })),
  ]
  return (
    <>
      <PageHeader title="New message" jobName={job?.title} />
      <div className="mx-auto max-w-3xl p-5">
        <Card className="p-5">
          <ActionForm action={newMessage} className="space-y-4">
            <Field label="Job" htmlFor="job_id" required>
              <Select id="job_id" name="job_id" defaultValue={job?.id ?? ''} required>
                <option value="" disabled>Pick a job</option>
                {ctx.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </Select>
            </Field>
            {picks.length > 0 && (
              <div className="flex flex-wrap gap-3 text-[13px]">
                {picks.map((p) => <label key={p.email} className="flex items-center gap-1.5"><Checkbox name="pick" value={p.email} /> {p.label} <span className="text-text-3">({p.group})</span></label>)}
              </div>
            )}
            <Field label="To" htmlFor="to" hint="Separate addresses with commas."><Input id="to" name="to" placeholder="name@example.com" /></Field>
            <Field label="Cc" htmlFor="cc"><Input id="cc" name="cc" /></Field>
            <Field label="Subject" htmlFor="subject" required><Input id="subject" name="subject" required maxLength={300} /></Field>
            <Field label="Message" htmlFor="body" required><Textarea id="body" name="body" rows={10} required maxLength={100000} /></Field>
            <Button type="submit" variant="primary">Send</Button>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}
