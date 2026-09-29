'use client'
import { useActionState, useState } from 'react'
import { RecordForm, FormSection } from '@/components/kit/record-form'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import type { ItemFormState } from './actions'

type Opt = { value: string; label: string; group: string }
export type ItemValues = {
  job_id?: string; title?: string; start_date?: string; duration?: number; phase?: string | null; color?: string | null; progress?: number
  is_hourly?: boolean; start_time?: string | null; end_time?: string | null; show_on_gantt?: boolean; show_subs?: boolean; show_client?: boolean
  notes_all?: string | null; notes_internal?: string | null; notes_sub?: string | null; notes_client?: string | null; reminder_days?: number | null
  assignees?: string[]
}

export function ItemForm({ title, action, cancelHref, jobs, assignable, phases, values = {}, isEdit, online, today }: {
  title: string; action: (s: ItemFormState, fd: FormData) => Promise<ItemFormState>; cancelHref: string
  jobs: { id: string; title: string }[]; assignable: Record<string, Opt[]>; phases: Record<string, string[]>
  values?: ItemValues; isEdit?: boolean; online?: boolean; today: string
}) {
  const [state, formAction] = useActionState(action, {})
  const [job, setJob] = useState(values.job_id ?? jobs[0]?.id ?? '')
  const [hourly, setHourly] = useState(values.is_hourly ?? false)
  const fe = state.fieldErrors ?? {}
  const opts = (assignable[job] ?? []).filter((o) => o.group !== 'Clients')
  const groups = [...new Set(opts.map((o) => o.group))]
  return (
    <RecordForm title={title} action={formAction} cancelHref={cancelHref} error={state.error} saveLabel={isEdit ? 'Save' : 'Create item'}>
      <FormSection title="Schedule item">
        <Field label="Title" htmlFor="title" required error={fe.title} className="sm:col-span-2"><Input id="title" name="title" required maxLength={120} defaultValue={values.title} /></Field>
        <Field label="Job" htmlFor="job_id" required>
          <Select id="job_id" name="job_id" value={job} onChange={(e) => setJob(e.target.value)} disabled={isEdit}>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </Select>
          {isEdit && <input type="hidden" name="job_id" value={job} />}
        </Field>
        <Field label="Phase" htmlFor="phase" hint="Pick one or type a new phase">
          <Input id="phase" name="phase" list="phase-list" defaultValue={values.phase ?? ''} />
          <datalist id="phase-list">{(phases[job] ?? []).map((p) => <option key={p} value={p} />)}</datalist>
        </Field>
        <Field label="Start date" htmlFor="start_date" required error={fe.start_date} hint="Moves to the next workday if needed"><Input id="start_date" name="start_date" type="date" required defaultValue={values.start_date ?? today} /></Field>
        <Field label="Duration (workdays)" htmlFor="duration" required error={fe.duration}><Input id="duration" name="duration" type="number" min={1} max={2000} required defaultValue={values.duration ?? 1} /></Field>
        {isEdit && online && (
          <Field label="Reason for date change" htmlFor="reason" hint="Logged in the shift history if dates move" className="sm:col-span-2">
            <Select id="reason" name="reason" defaultValue=""><option value="">No change / not specified</option><option>Weather</option><option>Material delay</option><option>Trade availability</option><option>Inspection</option><option>Client change</option><option>Other</option></Select>
          </Field>
        )}
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="is_hourly" checked={hourly} onChange={(e) => setHourly(e.target.checked)} className="accent-brand" />Set times</label>
        {hourly && (
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Start time" name="start_time" type="time" defaultValue={values.start_time?.slice(0, 5) ?? '08:00'} />
            <Input aria-label="End time" name="end_time" type="time" defaultValue={values.end_time?.slice(0, 5) ?? '16:00'} />
          </div>
        )}
        <Field label="Progress" htmlFor="progress"><Input id="progress" name="progress" type="number" min={0} max={100} defaultValue={values.progress ?? 0} /></Field>
        <Field label="Colour" htmlFor="color" hint="Defaults to the job colour"><Input id="color" name="color" type="color" defaultValue={values.color ?? '#4F7CAC'} className="h-8 w-20 p-0.5" /></Field>
        <Field label="Reminder" htmlFor="reminder_days">
          <Select id="reminder_days" name="reminder_days" defaultValue={values.reminder_days?.toString() ?? ''}><option value="">None</option><option value="0">Same day</option><option value="1">1 day before</option><option value="2">2 days before</option><option value="7">1 week before</option></Select>
        </Field>
      </FormSection>
      <FormSection title="Assigned to" description="Subs confirm or decline once the schedule is online.">
        <div className="sm:col-span-2">
          {groups.map((g) => (
            <fieldset key={g} className="mb-3">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-3">{g}</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {opts.filter((o) => o.group === g).map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="assignees" value={o.value} defaultChecked={values.assignees?.includes(o.value)} className="accent-brand" />{o.label}</label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </FormSection>
      <FormSection title="Visibility">
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="show_on_gantt" defaultChecked={values.show_on_gantt ?? true} className="accent-brand" />Show on Gantt</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="show_subs" defaultChecked={values.show_subs ?? false} className="accent-brand" />Show to subs who aren’t assigned</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="show_client" defaultChecked={values.show_client ?? false} className="accent-brand" />Show to client</label>
      </FormSection>
      <FormSection title="Notes">
        <Field label="Notes for everyone" htmlFor="notes_all" className="sm:col-span-2"><Textarea id="notes_all" name="notes_all" maxLength={4000} defaultValue={values.notes_all ?? ''} /></Field>
        <Field label="Internal notes" htmlFor="notes_internal"><Textarea id="notes_internal" name="notes_internal" maxLength={4000} defaultValue={values.notes_internal ?? ''} /></Field>
        <Field label="Notes for subs" htmlFor="notes_sub"><Textarea id="notes_sub" name="notes_sub" maxLength={4000} defaultValue={values.notes_sub ?? ''} /></Field>
        <Field label="Notes for client" htmlFor="notes_client" className="sm:col-span-2"><Textarea id="notes_client" name="notes_client" maxLength={4000} defaultValue={values.notes_client ?? ''} /></Field>
      </FormSection>
    </RecordForm>
  )
}
