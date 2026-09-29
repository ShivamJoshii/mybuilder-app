import type { Metadata } from 'next'
import { getAppContext } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionForm } from '@/components/kit/action-form'
import { PROVINCES } from '@/lib/utils'
import { Building2 } from 'lucide-react'
import { updateMySubProfile } from '../actions'

export const metadata: Metadata = { title: 'Company profile' }

/** Subs keep a separate company profile for each builder they work with. */
export default async function SubProfilePage() {
  const ctx = await getAppContext()
  const adminSubs = ctx.orgs.filter((o) => o.kind === 'sub' && o.is_admin).map((o) => o.org_id)
  const supabase = await createClient()
  const { data: links } = adminSubs.length
    ? await supabase.from('builder_sub_links').select('*').in('sub_org_id', adminSubs).order('company_name')
    : { data: [] }
  const builderName = new Map(ctx.buildersAsSub.map((b) => [b.link_id, b.builder_name]))
  return (
    <>
      <PageHeader title="Company profile" />
      <div className="max-w-3xl space-y-5 p-5">
        {(links ?? []).length === 0 && (
          <Card><EmptyState icon={Building2} title="No builders yet" body="When a builder adds you, your company profile for that builder appears here." /></Card>
        )}
        {(links ?? []).map((l) => (
          <Card key={l.id}>
            <CardHeader title={`Profile for ${builderName.get(l.id) ?? 'builder'}`} description="This builder sees these details." />
            <ActionForm action={updateMySubProfile.bind(null, l.id)} resetOnSuccess={false} className="grid gap-4 p-4 sm:grid-cols-2">
              <Field label="Company name" htmlFor={`cn-${l.id}`} required className="sm:col-span-2"><Input id={`cn-${l.id}`} name="company_name" defaultValue={l.company_name} required /></Field>
              <Field label="Contact first name" htmlFor={`fn-${l.id}`}><Input id={`fn-${l.id}`} name="primary_contact_first" defaultValue={l.primary_contact_first ?? ''} /></Field>
              <Field label="Contact last name" htmlFor={`ln-${l.id}`}><Input id={`ln-${l.id}`} name="primary_contact_last" defaultValue={l.primary_contact_last ?? ''} /></Field>
              <Field label="Business phone" htmlFor={`bp-${l.id}`}><Input id={`bp-${l.id}`} name="business_phone" type="tel" defaultValue={l.business_phone ?? ''} /></Field>
              <Field label="Cell phone" htmlFor={`cp-${l.id}`}><Input id={`cp-${l.id}`} name="cell_phone" type="tel" defaultValue={l.cell_phone ?? ''} /></Field>
              <Field label="Fax" htmlFor={`fx-${l.id}`}><Input id={`fx-${l.id}`} name="fax" defaultValue={l.fax ?? ''} /></Field>
              <Field label="Primary email" htmlFor={`pe-${l.id}`}><Input id={`pe-${l.id}`} name="primary_email" type="email" defaultValue={l.primary_email ?? ''} /></Field>
              <Field label="Street address" htmlFor={`st-${l.id}`} className="sm:col-span-2"><Input id={`st-${l.id}`} name="street" defaultValue={l.street ?? ''} /></Field>
              <Field label="City" htmlFor={`ci-${l.id}`}><Input id={`ci-${l.id}`} name="city" defaultValue={l.city ?? ''} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Province" htmlFor={`pr-${l.id}`}>
                  <Select id={`pr-${l.id}`} name="province" defaultValue={l.province ?? 'AB'}>{PROVINCES.map(([c]) => <option key={c} value={c}>{c}</option>)}</Select>
                </Field>
                <Field label="Postal code" htmlFor={`pc-${l.id}`}><Input id={`pc-${l.id}`} name="postal_code" defaultValue={l.postal_code ?? ''} /></Field>
              </div>
              <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><input type="checkbox" name="sms_opt_in" defaultChecked={l.sms_opt_in} className="accent-brand" />Receive text messages from this builder</label>
              <div className="sm:col-span-2"><Button type="submit" variant="primary">Save profile</Button></div>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  )
}
