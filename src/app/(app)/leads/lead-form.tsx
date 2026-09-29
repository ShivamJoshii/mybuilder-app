'use client'
import { useActionState } from 'react'
import { RecordForm, FormSection } from '@/components/kit/record-form'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { PROVINCES } from '@/lib/utils'
import type { LeadFormState } from './actions'

type L = { id: string; name: string }
export type LeadValues = Partial<{
  title: string; status_id: string; contact_first: string; contact_last: string; contact_email: string | null; contact_phone: string | null
  site_street: string | null; site_city: string | null; site_province: string | null; site_postal: string | null; confidence: number | null
  est_revenue_min: number | null; est_revenue_max: number | null; projected_sale_date: string | null; source_ids: string[]; project_type_ids: string[]
  notes: string | null; salespeople: string[]
}>

function Chips({ name, options, selected }: { name: string; options: L[]; selected?: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <label key={o.id} className="cursor-pointer">
          <input type="checkbox" name={name} value={o.id} defaultChecked={selected?.includes(o.id)} className="peer sr-only" />
          <span className="inline-flex rounded-full border border-border-strong px-2.5 py-0.5 text-[13px] peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand">{o.name}</span>
        </label>
      ))}
    </div>
  )
}

export function LeadForm({ title, action, cancelHref, values = {}, statuses, sources, types, salespeople, me, saveLabel }: {
  title: string; action: (s: LeadFormState, fd: FormData) => Promise<LeadFormState>; cancelHref: string; values?: LeadValues
  statuses: (L & { category: string })[]; sources: L[]; types: L[]; salespeople: L[]; me: string; saveLabel?: string
}) {
  const [state, formAction] = useActionState(action, {})
  const fe = state.fieldErrors ?? {}
  return (
    <RecordForm title={title} action={formAction} cancelHref={cancelHref} error={state.error} saveLabel={saveLabel}>
      <FormSection title="Opportunity">
        <Field label="Opportunity title" htmlFor="title" required error={fe.title} className="sm:col-span-2"><Input id="title" name="title" required maxLength={120} defaultValue={values.title} placeholder="e.g. Singh custom home, Windermere" /></Field>
        <Field label="Status" htmlFor="status_id">
          <Select id="status_id" name="status_id" defaultValue={values.status_id ?? statuses.find((s) => s.category === 'open')?.id}>
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Confidence (%)" htmlFor="confidence" error={fe.confidence}><Input id="confidence" name="confidence" type="number" min={0} max={100} defaultValue={values.confidence ?? ''} /></Field>
        <Field label="Estimated revenue from (CAD)" htmlFor="est_revenue_min"><Input id="est_revenue_min" name="est_revenue_min" type="number" min={0} step="1000" defaultValue={values.est_revenue_min ?? ''} /></Field>
        <Field label="Estimated revenue to (CAD)" htmlFor="est_revenue_max" error={fe.est_revenue_max}><Input id="est_revenue_max" name="est_revenue_max" type="number" min={0} step="1000" defaultValue={values.est_revenue_max ?? ''} /></Field>
        <Field label="Projected sale date" htmlFor="projected_sale_date"><Input id="projected_sale_date" name="projected_sale_date" type="date" defaultValue={values.projected_sale_date ?? ''} /></Field>
        <Field label="Salespeople" className="sm:col-span-2"><Chips name="salespeople" options={salespeople} selected={values.salespeople ?? [me]} /></Field>
        <Field label="Source" className="sm:col-span-2"><Chips name="source_ids" options={sources} selected={values.source_ids} /></Field>
        <Field label="Project type" className="sm:col-span-2"><Chips name="project_type_ids" options={types} selected={values.project_type_ids} /></Field>
      </FormSection>
      <FormSection title="Contact">
        <Field label="First name" htmlFor="contact_first"><Input id="contact_first" name="contact_first" defaultValue={values.contact_first} /></Field>
        <Field label="Last name" htmlFor="contact_last"><Input id="contact_last" name="contact_last" defaultValue={values.contact_last} /></Field>
        <Field label="Email" htmlFor="contact_email" error={fe.contact_email}><Input id="contact_email" name="contact_email" type="email" defaultValue={values.contact_email ?? ''} /></Field>
        <Field label="Phone" htmlFor="contact_phone"><Input id="contact_phone" name="contact_phone" type="tel" defaultValue={values.contact_phone ?? ''} /></Field>
      </FormSection>
      <FormSection title="Job site">
        <Field label="Street address" htmlFor="site_street" className="sm:col-span-2"><Input id="site_street" name="site_street" defaultValue={values.site_street ?? ''} /></Field>
        <Field label="City" htmlFor="site_city"><Input id="site_city" name="site_city" defaultValue={values.site_city ?? ''} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Province" htmlFor="site_province"><Select id="site_province" name="site_province" defaultValue={values.site_province ?? 'AB'}>{PROVINCES.map(([c]) => <option key={c} value={c}>{c}</option>)}</Select></Field>
          <Field label="Postal code" htmlFor="site_postal" error={fe.site_postal}><Input id="site_postal" name="site_postal" defaultValue={values.site_postal ?? ''} /></Field>
        </div>
      </FormSection>
      <FormSection title="Notes">
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2"><Textarea id="notes" name="notes" maxLength={8000} defaultValue={values.notes ?? ''} className="min-h-28" /></Field>
      </FormSection>
    </RecordForm>
  )
}
