'use client'
import { useActionState } from 'react'
import { RecordForm, FormSection } from '@/components/kit/record-form'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { PROVINCES, JOB_STATUSES } from '@/lib/utils'
import type { JobFormState } from './actions'

export type JobFormValues = {
  title?: string; job_type?: string | null; contract_type?: string; status?: string; color?: string
  street?: string | null; city?: string | null; province?: string | null; postal_code?: string | null
  permit_number?: string | null; lot_info?: string | null; square_feet?: number | null
  projected_start?: string | null; projected_end?: string | null; work_days?: number[]
  sub_notes?: string | null; contract_price?: number | null; internal_notes?: string | null
  managers?: string[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const COLORS = ['#4F7CAC', '#2E8B57', '#C0392B', '#D68910', '#8E44AD', '#16A085', '#2C3E50', '#E67E22', '#1ABC9C', '#7F8C8D']

export function JobForm({
  title, action, cancelHref, values = {}, users, canSeePrice, saveLabel,
}: {
  title: string
  action: (state: JobFormState, fd: FormData) => Promise<JobFormState>
  cancelHref: string
  values?: JobFormValues
  users: { user_id: string; name: string }[]
  canSeePrice: boolean
  saveLabel?: string
}) {
  const [state, formAction] = useActionState(action, {})
  const fe = state.fieldErrors ?? {}
  const workDays = values.work_days ?? [1, 2, 3, 4, 5]
  return (
    <RecordForm title={title} action={formAction} cancelHref={cancelHref} error={state.error} saveLabel={saveLabel}>
      <FormSection title="Job information">
        <Field label="Job name" htmlFor="title" required error={fe.title} className="sm:col-span-2">
          <Input id="title" name="title" required maxLength={120} defaultValue={values.title} />
        </Field>
        <Field label="Job type" htmlFor="job_type" hint="e.g. Single-family, Duplex, Renovation">
          <Input id="job_type" name="job_type" defaultValue={values.job_type ?? ''} />
        </Field>
        <Field label="Contract type" htmlFor="contract_type">
          <Select id="contract_type" name="contract_type" defaultValue={values.contract_type ?? 'fixed_price'}>
            <option value="fixed_price">Fixed price</option>
            <option value="open_book">Open book (cost plus)</option>
          </Select>
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={values.status ?? 'open'}>
            {JOB_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Job colour" htmlFor="color" error={fe.color}>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <label key={c} className="cursor-pointer">
                <input type="radio" name="color" value={c} defaultChecked={(values.color ?? COLORS[0]) === c} className="peer sr-only" />
                <span className="block size-6 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-text peer-focus-visible:ring-2 peer-focus-visible:ring-brand" style={{ background: c }} aria-label={c} />
              </label>
            ))}
          </div>
        </Field>
      </FormSection>

      <FormSection title="Address">
        <Field label="Street address" htmlFor="street" className="sm:col-span-2">
          <Input id="street" name="street" autoComplete="street-address" defaultValue={values.street ?? ''} />
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" defaultValue={values.city ?? ''} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Province" htmlFor="province">
            <Select id="province" name="province" defaultValue={values.province ?? 'AB'}>
              {PROVINCES.map(([code]) => <option key={code} value={code}>{code}</option>)}
            </Select>
          </Field>
          <Field label="Postal code" htmlFor="postal_code" error={fe.postal_code}>
            <Input id="postal_code" name="postal_code" defaultValue={values.postal_code ?? ''} placeholder="T5J 0N3" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Schedule">
        <Field label="Projected start" htmlFor="projected_start">
          <Input id="projected_start" name="projected_start" type="date" defaultValue={values.projected_start ?? ''} />
        </Field>
        <Field label="Projected completion" htmlFor="projected_end" error={fe.projected_end}>
          <Input id="projected_end" name="projected_end" type="date" defaultValue={values.projected_end ?? ''} />
        </Field>
        <Field label="Work days" error={fe.work_days} className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <label key={d} className="cursor-pointer">
                <input type="checkbox" name="work_days" value={i} defaultChecked={workDays.includes(i)} className="peer sr-only" />
                <span className="inline-flex h-8 w-11 items-center justify-center rounded-md border border-border-strong text-[13px] peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand">{d}</span>
              </label>
            ))}
          </div>
        </Field>
      </FormSection>

      <FormSection title="Additional information">
        <Field label="Project managers" className="sm:col-span-2">
          {users.length === 0 ? <p className="text-[13px] text-text-3">No internal users yet.</p> : (
            <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
              {users.map((u) => (
                <label key={u.user_id} className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" name="managers" value={u.user_id} defaultChecked={values.managers?.includes(u.user_id)} className="accent-brand" />
                  {u.name}
                </label>
              ))}
            </div>
          )}
        </Field>
        <Field label="Permit number" htmlFor="permit_number">
          <Input id="permit_number" name="permit_number" defaultValue={values.permit_number ?? ''} />
        </Field>
        <Field label="Lot info" htmlFor="lot_info">
          <Input id="lot_info" name="lot_info" defaultValue={values.lot_info ?? ''} />
        </Field>
        <Field label="Square feet" htmlFor="square_feet" error={fe.square_feet}>
          <Input id="square_feet" name="square_feet" type="number" min={0} defaultValue={values.square_feet ?? ''} />
        </Field>
        {canSeePrice && (
          <Field label="Contract price (CAD)" htmlFor="contract_price" error={fe.contract_price}>
            <Input id="contract_price" name="contract_price" type="number" min={0} step="0.01" defaultValue={values.contract_price ?? ''} />
          </Field>
        )}
      </FormSection>

      <FormSection title="Notes">
        <Field label="Notes for subs and vendors" htmlFor="sub_notes" hint="Visible to subs on this job." className="sm:col-span-2">
          <Textarea id="sub_notes" name="sub_notes" maxLength={4000} defaultValue={values.sub_notes ?? ''} />
        </Field>
        {canSeePrice && (
          <Field label="Internal notes" htmlFor="internal_notes" hint="Only your team can see these." className="sm:col-span-2">
            <Textarea id="internal_notes" name="internal_notes" maxLength={4000} defaultValue={values.internal_notes ?? ''} />
          </Field>
        )}
      </FormSection>
    </RecordForm>
  )
}
