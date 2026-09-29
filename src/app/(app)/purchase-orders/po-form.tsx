import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ActionForm, type ActionState } from '@/components/kit/action-form'

export function PoForm({ action, jobs, subs, defaults, submitLabel }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  jobs?: { id: string; title: string }[]
  subs: { sub_org_id: string; company_name: string; trade: string | null }[]
  defaults: { job_id?: string; title: string; scope: string; payee: string; vendor_name: string; holdback_pct: number; lien_waiver_required: boolean }
  submitLabel: string
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
      <Field label="Title" htmlFor="title" required className="sm:col-span-2"><Input id="title" name="title" defaultValue={defaults.title} required maxLength={200} /></Field>
      <Field label="Sub or vendor" htmlFor="payee" required>
        <Select id="payee" name="payee" defaultValue={defaults.payee} required>
          <option value="" disabled>Pick one</option>
          {subs.map((s) => <option key={s.sub_org_id} value={`s:${s.sub_org_id}`}>{s.company_name}{s.trade ? ` · ${s.trade}` : ''}</option>)}
          <option value="vendor">One-off vendor (no portal)…</option>
        </Select>
      </Field>
      <Field label="Vendor name" htmlFor="vendor_name" hint="Only for one-off vendors."><Input id="vendor_name" name="vendor_name" defaultValue={defaults.vendor_name} maxLength={200} /></Field>
      <Field label="Holdback %" htmlFor="holdback_pct" hint="Withheld from each bill until released. 10% is standard in most provinces.">
        <Input id="holdback_pct" name="holdback_pct" type="number" min="0" max="100" step="0.5" defaultValue={defaults.holdback_pct} />
      </Field>
      <label className="flex items-center gap-2 self-center text-[13px] text-text-2"><Checkbox name="lien_waiver_required" defaultChecked={defaults.lien_waiver_required} /> Require a lien waiver before paying bills</label>
      <Field label="Scope of work" htmlFor="scope" className="sm:col-span-2"><Textarea id="scope" name="scope" rows={4} defaultValue={defaults.scope} maxLength={20000} /></Field>
      <div className="sm:col-span-2"><Button type="submit" variant="primary">{submitLabel}</Button></div>
    </ActionForm>
  )
}
