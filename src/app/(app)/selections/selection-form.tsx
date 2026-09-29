'use client'
import { keepValues } from '@/lib/forms'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import type { ActionState } from '@/components/kit/action-form'
import { SELECTION_CATEGORIES } from '@/lib/selection'

export type SelDefaults = {
  job_id: string; title: string; category: string; location: string; instructions: string; allowance: string
  deadline: string; schedule_item_id: string; days_before: number; share_client: boolean; share_subs: boolean
}

export function SelectionForm({ action, jobs, scheduleItems, defaults, submitLabel }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  jobs: { id: string; title: string }[]
  scheduleItems: { id: string; job_id: string; title: string; start_date: string }[]
  defaults: SelDefaults; submitLabel: string
}) {
  const [state, formAction, pending] = useActionState(action, {})
  const [jobId, setJobId] = useState(defaults.job_id)
  const [mode, setMode] = useState<'none' | 'date' | 'schedule'>(defaults.schedule_item_id ? 'schedule' : defaults.deadline ? 'date' : 'none')
  const items = scheduleItems.filter((s) => s.job_id === jobId)
  return (
    <form onSubmit={keepValues(formAction)} className="grid gap-4 sm:grid-cols-2">
      {state.error && <Alert className="sm:col-span-2">{state.error}</Alert>}
      <Field label="Job" htmlFor="job_id" required className="sm:col-span-2">
        <Select id="job_id" name="job_id" value={jobId} onChange={(e) => setJobId(e.target.value)} required disabled={jobs.length === 1 && Boolean(defaults.job_id)}>
          <option value="" disabled>Pick a job</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </Select>
        {jobs.length === 1 && defaults.job_id && <input type="hidden" name="job_id" value={jobId} />}
      </Field>
      <Field label="Title" htmlFor="title" required className="sm:col-span-2"><Input id="title" name="title" defaultValue={defaults.title} required maxLength={200} /></Field>
      <Field label="Category" htmlFor="category">
        <Input id="category" name="category" list="sel-categories" defaultValue={defaults.category} maxLength={80} />
        <datalist id="sel-categories">{SELECTION_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Location" htmlFor="location"><Input id="location" name="location" defaultValue={defaults.location} placeholder="e.g. Kitchen" maxLength={80} /></Field>
      <Field label="Allowance" htmlFor="allowance" hint="Leave blank if there is no allowance."><Input id="allowance" name="allowance" type="number" step="0.01" min="0" defaultValue={defaults.allowance} /></Field>
      <Field label="Deadline" htmlFor="deadline_mode">
        <Select id="deadline_mode" name="deadline_mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="none">No deadline</option><option value="date">On a date</option><option value="schedule">Before a schedule item</option>
        </Select>
      </Field>
      {mode === 'date' && <Field label="Deadline date" htmlFor="deadline"><Input id="deadline" name="deadline" type="date" defaultValue={defaults.deadline} required /></Field>}
      {mode === 'schedule' && (
        <>
          <Field label="Schedule item" htmlFor="schedule_item_id">
            <Select id="schedule_item_id" name="schedule_item_id" defaultValue={defaults.schedule_item_id} required>
              <option value="">Pick an item</option>
              {items.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.start_date})</option>)}
            </Select>
          </Field>
          <Field label="Days before it starts" htmlFor="days_before"><Input id="days_before" name="days_before" type="number" min="0" max="365" defaultValue={defaults.days_before} /></Field>
        </>
      )}
      <Field label="Instructions for the client" htmlFor="instructions" className="sm:col-span-2"><Textarea id="instructions" name="instructions" rows={3} defaultValue={defaults.instructions} maxLength={8000} /></Field>
      <div className="space-y-1.5 text-[13px] text-text-2 sm:col-span-2">
        <label className="flex items-center gap-2"><Checkbox name="share_client" defaultChecked={defaults.share_client} /> Client can see and choose</label>
        <label className="flex items-center gap-2"><Checkbox name="share_subs" defaultChecked={defaults.share_subs} /> Subs on the job can see it (no prices)</label>
      </div>
      <div className="sm:col-span-2"><Button type="submit" variant="primary" disabled={pending}>{submitLabel}</Button></div>
    </form>
  )
}
