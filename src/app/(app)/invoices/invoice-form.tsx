import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { ActionForm, type ActionState } from '@/components/kit/action-form'

export function InvoiceForm({ action, jobs, defaults, submitLabel, withTax }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  jobs?: { id: string; title: string }[]
  defaults: { job_id?: string; title: string; description: string; invoice_date: string; due_date: string; holdback_pct: number; tax_rate?: number; tax_label?: string }
  submitLabel: string; withTax?: boolean
}) {
  return (
    <ActionForm action={action} resetOnSuccess={false} className="grid gap-4 sm:grid-cols-2">
      {jobs && (
        <Field label="Job" htmlFor="job_id" required className="sm:col-span-2">
          <Select id="job_id" name="job_id" defaultValue={defaults.job_id ?? ''} required>
            <option value="" disabled>Pick a job</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Title" htmlFor="title" required className="sm:col-span-2"><Input id="title" name="title" defaultValue={defaults.title} required maxLength={200} placeholder="e.g. Draw 2 — framing complete" /></Field>
      <Field label="Invoice date" htmlFor="invoice_date" required><Input id="invoice_date" name="invoice_date" type="date" defaultValue={defaults.invoice_date} required /></Field>
      <Field label="Due date" htmlFor="due_date"><Input id="due_date" name="due_date" type="date" defaultValue={defaults.due_date} /></Field>
      <Field label="Owner holdback %" htmlFor="holdback_pct" hint="What your client withholds under provincial lien law (often 10%)."><Input id="holdback_pct" name="holdback_pct" type="number" min="0" max="100" step="0.5" defaultValue={defaults.holdback_pct} /></Field>
      {withTax && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tax label" htmlFor="tax_label"><Input id="tax_label" name="tax_label" defaultValue={defaults.tax_label} maxLength={30} /></Field>
          <Field label="Tax rate %" htmlFor="tax_rate"><Input id="tax_rate" name="tax_rate" type="number" step="0.001" min="0" max="100" defaultValue={defaults.tax_rate} /></Field>
        </div>
      )}
      <Field label="Note to client" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" rows={3} defaultValue={defaults.description} maxLength={8000} /></Field>
      <div className="sm:col-span-2"><Button type="submit" variant="primary">{submitLabel}</Button></div>
    </ActionForm>
  )
}
