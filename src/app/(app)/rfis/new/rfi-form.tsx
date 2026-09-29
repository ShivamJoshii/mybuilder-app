'use client'
import { useActionState, useState } from 'react'
import { X } from 'lucide-react'
import { RecordForm, FormSection } from '@/components/kit/record-form'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createRfi, type RfiFormState } from '../actions'

type Opt = { value: string; label: string; group: string }
type Target = { type: string; id: string; job_id: string; label: string }
const TYPE_LABEL: Record<string, string> = { todo: 'To-do', daily_log: 'Daily log', rfi: 'RFI' }

export function RfiForm({ jobs, assignees, targets, defaultJob }: {
  jobs: { id: string; title: string }[]; assignees: Record<string, Opt[]>; targets: Target[]; defaultJob?: string
}) {
  const [state, action] = useActionState<RfiFormState, FormData>(createRfi, {})
  const [job, setJob] = useState(defaultJob ?? jobs[0]?.id ?? '')
  const [related, setRelated] = useState<Target[]>([])
  const [pickType, setPickType] = useState('todo')
  const fe = state.fieldErrors ?? {}
  const opts = assignees[job] ?? []
  const groups = [...new Set(opts.map((o) => o.group))]
  const choices = targets.filter((t) => t.job_id === job && t.type === pickType && !related.some((r) => r.id === t.id))
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)

  return (
    <RecordForm title="New RFI" action={action} cancelHref="/rfis" error={state.error} saveLabel="Send" draftLabel="Save">
      <FormSection title="RFI">
        <Field label="Title" htmlFor="title" required error={fe.title} className="sm:col-span-2"><Input id="title" name="title" required maxLength={200} /></Field>
        <Field label="Job" htmlFor="job_id" required>
          <Select id="job_id" name="job_id" value={job} onChange={(e) => { setJob(e.target.value); setRelated([]) }}>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="due_date" required error={fe.due_date}><Input id="due_date" name="due_date" type="date" defaultValue={in7} required /></Field>
        <Field label="Assignee" htmlFor="assignee" className="sm:col-span-2">
          <Select id="assignee" name="assignee" defaultValue="builder">
            <option value="builder">The builder (unassigned)</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>{opts.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Question" htmlFor="question" required error={fe.question} className="sm:col-span-2">
          <Textarea id="question" name="question" required maxLength={10000} className="min-h-40" />
        </Field>
      </FormSection>
      <FormSection title="Related items" description="Link the records this question is about.">
        <div className="space-y-2 sm:col-span-2">
          {related.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-[13px]">
              <input type="hidden" name="related" value={`${r.type}:${r.id}`} />
              <span className="text-xs text-text-3">{TYPE_LABEL[r.type]}</span><span className="flex-1">{r.label}</span>
              <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${r.label}`} onClick={() => setRelated((c) => c.filter((x) => x.id !== r.id))}><X /></Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Related type" className="w-36" value={pickType} onChange={(e) => setPickType(e.target.value)}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select aria-label="Related record" className="min-w-56 flex-1" value="" onChange={(e) => {
              const t = choices.find((c) => c.id === e.target.value); if (t) setRelated((c) => [...c, t])
            }}>
              <option value="">{choices.length ? 'Add a related item…' : 'Nothing to link on this job'}</option>
              {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </div>
        </div>
      </FormSection>
    </RecordForm>
  )
}
