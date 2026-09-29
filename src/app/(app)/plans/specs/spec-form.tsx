import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ActionForm, type ActionState } from '@/components/kit/action-form'

export const DIVISIONS = ['General requirements', 'Site work', 'Concrete', 'Masonry', 'Metals', 'Wood and framing', 'Thermal and moisture', 'Doors and windows',
  'Finishes', 'Specialties', 'Equipment and appliances', 'Furnishings', 'Plumbing', 'HVAC', 'Electrical', 'Landscaping']

export function SpecForm({ action, jobs, defaults, submitLabel }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  jobs: { id: string; title: string }[]
  defaults: { job_id: string; division: string; title: string; body: string; share_subs: boolean; share_clients: boolean }
  submitLabel: string
}) {
  return (
    <ActionForm action={action} resetOnSuccess={false} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job" htmlFor="job_id" required>
          <Select id="job_id" name="job_id" defaultValue={defaults.job_id} required>
            <option value="" disabled>Pick a job</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </Select>
        </Field>
        <Field label="Division" htmlFor="division">
          <Input id="division" name="division" list="divisions" defaultValue={defaults.division} maxLength={80} />
          <datalist id="divisions">{DIVISIONS.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
      </div>
      <Field label="Title" htmlFor="title" required><Input id="title" name="title" defaultValue={defaults.title} required maxLength={200} /></Field>
      <Field label="Specification" htmlFor="body" hint="Plain text. Blank lines start new paragraphs; lines starting with “- ” become bullets.">
        <Textarea id="body" name="body" rows={16} defaultValue={defaults.body} maxLength={100000} className="font-mono text-[13px]" />
      </Field>
      <div className="space-y-1.5 text-[13px] text-text-2">
        <label className="flex items-center gap-2"><Checkbox name="share_subs" defaultChecked={defaults.share_subs} /> Share with subs on the job</label>
        <label className="flex items-center gap-2"><Checkbox name="share_clients" defaultChecked={defaults.share_clients} /> Share with the client</label>
      </div>
      <Button type="submit" variant="primary">{submitLabel}</Button>
    </ActionForm>
  )
}

/** Very small plain-text renderer: paragraphs and "- " bullets. */
export function SpecBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className="space-y-3 text-[14px] leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => l.startsWith('- '))) return <ul key={i} className="list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>
        return <p key={i} className="whitespace-pre-wrap">{b}</p>
      })}
    </div>
  )
}
