'use client'
import { useActionState, useState } from 'react'
import { RecordForm, FormSection } from '@/components/kit/record-form'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { createTodo, type TodoFormState } from '../actions'

type Opt = { value: string; label: string; group: string }

export function TodoForm({ jobs, assignable, defaultJob }: { jobs: { id: string; title: string }[]; assignable: Record<string, Opt[]>; defaultJob?: string }) {
  const [state, action] = useActionState<TodoFormState, FormData>(createTodo, {})
  const [job, setJob] = useState(defaultJob ?? jobs[0]?.id ?? '')
  const fe = state.fieldErrors ?? {}
  const opts = assignable[job] ?? []
  const groups = [...new Set(opts.map((o) => o.group))]
  return (
    <RecordForm title="New to-do" action={action} cancelHref="/todos" error={state.error} saveLabel="Create to-do">
      <FormSection title="To-do">
        <Field label="Title" htmlFor="title" required error={fe.title} className="sm:col-span-2">
          <Input id="title" name="title" required maxLength={200} />
        </Field>
        <Field label="Job" htmlFor="job_id" required error={fe.job_id}>
          <Select id="job_id" name="job_id" value={job} onChange={(e) => setJob(e.target.value)} required>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue="medium">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </Select>
        </Field>
        <Field label="Due date" htmlFor="due_date" error={fe.due_date}><Input id="due_date" name="due_date" type="date" /></Field>
        <Field label="Due time" htmlFor="due_time" hint="Optional"><Input id="due_time" name="due_time" type="time" /></Field>
        <Field label="Reminder" htmlFor="reminder_minutes">
          <Select id="reminder_minutes" name="reminder_minutes" defaultValue="">
            <option value="">None</option><option value="20">20 minutes before</option><option value="60">1 hour before</option>
            <option value="1440">1 day before</option><option value="2880">2 days before</option>
          </Select>
        </Field>
      </FormSection>
      <FormSection title="Assign to">
        <div className="sm:col-span-2">
          {groups.map((g) => (
            <fieldset key={g} className="mb-3">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-3">{g}</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {opts.filter((o) => o.group === g).map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" name="assignees" value={o.value} className="accent-brand" />{o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </FormSection>
      <FormSection title="Details">
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2"><Textarea id="notes" name="notes" maxLength={8000} /></Field>
        <Field label="Checklist" htmlFor="checklist" hint="One item per line. Every item must be ticked before the to-do can be completed." className="sm:col-span-2">
          <Textarea id="checklist" name="checklist" className="min-h-24" />
        </Field>
      </FormSection>
    </RecordForm>
  )
}
