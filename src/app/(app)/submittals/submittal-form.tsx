import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { ActionForm, type ActionState } from '@/components/kit/action-form'
import { SUBMITTAL_KINDS } from '@/lib/submittal'

type D = { job_id?: string; title: string; spec_section: string; kind: string; description: string; submitter: string; reviewer: string; due_date: string; required_on_site: string }

export function SubmittalForm({ action, jobs, subs, team, defaults, isNew }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  jobs?: { id: string; title: string }[]; subs: { sub_org_id: string; company_name: string }[]; team: { value: string; label: string }[]
  defaults: D; isNew?: boolean
}) {
  return (
    <ActionForm action={action} resetOnSuccess={false} className="grid gap-4 sm:grid-cols-2">
      {jobs && (
        <Field label="Job" htmlFor="job_id" required className="sm:col-span-2">
          <Select id="job_id" name="job_id" defaultValue={defaults.job_id ?? ''} required><option value="" disabled>Pick a job</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</Select>
        </Field>
      )}
      <Field label="Title" htmlFor="title" required className="sm:col-span-2"><Input id="title" name="title" defaultValue={defaults.title} required maxLength={200} placeholder="e.g. Window shop drawings" /></Field>
      <Field label="Spec section" htmlFor="spec_section"><Input id="spec_section" name="spec_section" defaultValue={defaults.spec_section} maxLength={60} placeholder="e.g. 08 50 00" /></Field>
      <Field label="Type" htmlFor="kind"><Select id="kind" name="kind" defaultValue={defaults.kind}>{Object.entries(SUBMITTAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="Submitted by (sub)" htmlFor="submitter"><Select id="submitter" name="submitter" defaultValue={defaults.submitter}><option value="">—</option>{subs.map((s) => <option key={s.sub_org_id} value={s.sub_org_id}>{s.company_name}</option>)}</Select></Field>
      <Field label="Reviewer" htmlFor="reviewer"><Select id="reviewer" name="reviewer" defaultValue={defaults.reviewer}><option value="">—</option>{team.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
      <Field label="Due from sub" htmlFor="due_date"><Input id="due_date" name="due_date" type="date" defaultValue={defaults.due_date} /></Field>
      <Field label="Needed on site" htmlFor="required_on_site"><Input id="required_on_site" name="required_on_site" type="date" defaultValue={defaults.required_on_site} /></Field>
      <Field label="What’s needed" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" rows={4} defaultValue={defaults.description} maxLength={8000} /></Field>
      <div className="flex gap-2 sm:col-span-2">
        {isNew ? <>
          <Button type="submit" name="intent" value="request" variant="primary">Save and request from sub</Button>
          <Button type="submit" name="intent" value="draft">Save draft</Button>
        </> : <Button type="submit" variant="primary">Save</Button>}
      </div>
    </ActionForm>
  )
}
