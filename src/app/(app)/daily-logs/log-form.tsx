'use client'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { CloudSun, Droplets, Wind } from 'lucide-react'
import { RecordForm, FormSection } from '@/components/kit/record-form'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import type { LogFormState } from './actions'
import { weatherFor } from './actions'
import type { Weather } from '@/lib/weather'

export type LogValues = {
  job_id?: string; log_date?: string; title?: string | null; notes?: string; tag_ids?: string[]
  include_weather?: boolean; weather_notes?: string | null; include_weather_notes?: boolean
  share_internal?: boolean; share_subs?: boolean; share_clients?: boolean; status?: 'draft' | 'published'
  weather?: Weather | null
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function LogForm({
  title, action, cancelHref, jobs, tags, values = {}, mode, canTag,
}: {
  title: string
  action: (s: LogFormState, fd: FormData) => Promise<LogFormState>
  cancelHref: string
  jobs: { id: string; title: string }[]
  tags: { id: string; name: string }[]
  values?: LogValues
  mode: 'builder' | 'sub'
  canTag: boolean
}) {
  const [state, formAction] = useActionState(action, {})
  const [job, setJob] = useState(values.job_id ?? jobs[0]?.id ?? '')
  const [date, setDate] = useState(values.log_date ?? today())
  const [weather, setWeather] = useState<Weather | null | undefined>(values.weather ?? undefined)
  const [loading, start] = useTransition()
  const [notes, setNotes] = useState(values.notes ?? '')
  const fe = state.fieldErrors ?? {}

  useEffect(() => {
    if (!job || !date) return
    start(async () => setWeather(await weatherFor(job, date)))
  }, [job, date])

  const isDraft = (values.status ?? 'draft') === 'draft'
  return (
    <RecordForm title={title} action={formAction} cancelHref={cancelHref} error={state.error}
      saveLabel={isDraft ? 'Publish' : 'Save'} draftLabel={isDraft ? 'Save draft' : undefined} draft={isDraft}>
      <FormSection title="Daily log">
        <Field label="Job" htmlFor="job_id" required error={fe.job_id}>
          <Select id="job_id" name="job_id" value={job} onChange={(e) => setJob(e.target.value)} required disabled={Boolean(values.job_id)}>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </Select>
          {values.job_id && <input type="hidden" name="job_id" value={job} />}
        </Field>
        <Field label="Date" htmlFor="log_date" required error={fe.log_date}>
          <Input id="log_date" name="log_date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Title" htmlFor="title" hint="Optional, 50 characters max" error={fe.title} className="sm:col-span-2">
          <Input id="title" name="title" maxLength={50} defaultValue={values.title ?? ''} />
        </Field>
        <Field label="Notes" htmlFor="notes" required error={fe.notes} className="sm:col-span-2">
          <Textarea id="notes" name="notes" maxLength={4000} required className="min-h-40" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <p className="mt-1 text-right text-xs text-text-3">{notes.length} / 4,000</p>
        </Field>
        {(tags.length > 0 || canTag) && (
          <Field label="Tags" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <label key={t.id} className="cursor-pointer">
                  <input type="checkbox" name="tag_ids" value={t.id} defaultChecked={values.tag_ids?.includes(t.id)} className="peer sr-only" />
                  <span className="inline-flex rounded-full border border-border-strong px-2.5 py-0.5 text-[13px] peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand">{t.name}</span>
                </label>
              ))}
            </div>
            {canTag && <Input name="new_tags" aria-label="New tags" placeholder="Add new tags, separated by commas (e.g. Delivery postponed)" className="mt-2" />}
          </Field>
        )}
      </FormSection>

      <FormSection title="Weather" description="Filled in from the job address for the log date.">
        <div className="sm:col-span-2">
          {loading ? <p className="text-[13px] text-text-3">Getting the weather…</p> : weather ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md bg-surface-2 px-3 py-2.5 text-[13px]" data-testid="weather">
              <span className="flex items-center gap-2 font-medium"><CloudSun className="size-5 text-brand" />{weather.condition}</span>
              <span>High {weather.high_c}°C · Low {weather.low_c}°C</span>
              <span className="flex items-center gap-1"><Wind className="size-4 text-text-3" />{weather.wind_kmh} km/h</span>
              {weather.humidity_pct != null && <span>{weather.humidity_pct}% humidity</span>}
              <span className="flex items-center gap-1"><Droplets className="size-4 text-text-3" />{weather.precip_mm} mm</span>
            </div>
          ) : <p className="text-[13px] text-text-3">No weather available. Add a city to the job to get weather.</p>}
        </div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="include_weather" defaultChecked={values.include_weather ?? true} className="accent-brand" />Include weather conditions</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="include_weather_notes" defaultChecked={values.include_weather_notes ?? false} className="accent-brand" />Include weather notes</label>
        <Field label="Weather notes" htmlFor="weather_notes" className="sm:col-span-2">
          <Input id="weather_notes" name="weather_notes" maxLength={1000} defaultValue={values.weather_notes ?? ''} placeholder="e.g. Rain stopped pour at 2 pm" />
        </Field>
      </FormSection>

      <FormSection title="Sharing" description={mode === 'sub' ? 'Your builder always sees your logs.' : 'With sharing off, only you can see this log.'}>
        {mode === 'builder' && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="share_internal" defaultChecked={values.share_internal ?? true} className="accent-brand" />Internal users</label>}
        {mode === 'builder' && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="share_subs" defaultChecked={values.share_subs ?? false} className="accent-brand" />Subs and vendors</label>}
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="share_clients" defaultChecked={values.share_clients ?? false} className="accent-brand" />Client</label>
      </FormSection>
    </RecordForm>
  )
}
