import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireBuilder, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/kit/action-form'
import { PROVINCES } from '@/lib/utils'
import { updateCompany, updateClientDefaults } from '../actions'
import { LogoUpload } from './logo-upload'

export const metadata: Metadata = { title: 'Company' }

const TIMEZONES = ['America/Vancouver', 'America/Edmonton', 'America/Regina', 'America/Winnipeg', 'America/Toronto', 'America/Halifax', 'America/St_Johns']

export default async function CompanyPage() {
  const ctx = await requireBuilder()
  if (!hasAction(ctx, 'settings.manage')) redirect('/settings/profile')
  const supabase = await createClient()
  const [{ data: org }, { data: defaults }] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', ctx.workspace.orgId).single(),
    supabase.from('client_permission_defaults').select('settings').eq('org_id', ctx.workspace.orgId).maybeSingle(),
  ])
  const s = (defaults?.settings ?? {}) as Record<string, unknown>
  const check = (name: string, label: string) => (
    <label className="flex items-center gap-2 text-[13px]">
      <input type="checkbox" name={name} defaultChecked={Boolean(s[name])} className="accent-brand" />{label}
    </label>
  )
  return (
    <>
      <PageHeader title="Company" />
      <div className="max-w-3xl space-y-5 p-5">
        <Card>
          <CardHeader title="Logo" />
          <div className="p-4"><LogoUpload orgId={ctx.workspace.orgId} hasLogo={Boolean(org?.logo_url)} version={org?.updated_at ?? ''} /></div>
        </Card>
        <Card>
          <CardHeader title="Company information" description="Shown on printouts and to your subs and clients." />
          <ActionForm action={updateCompany} resetOnSuccess={false} className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Company name" htmlFor="name" required><Input id="name" name="name" defaultValue={org?.name} required /></Field>
            <Field label="Legal name" htmlFor="legal_name"><Input id="legal_name" name="legal_name" defaultValue={org?.legal_name ?? ''} /></Field>
            <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={org?.phone ?? ''} /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={org?.email ?? ''} /></Field>
            <Field label="GST/HST number" htmlFor="gst_number" hint="Printed on invoices (required by CRA over $30)."><Input id="gst_number" name="gst_number" defaultValue={org?.gst_number ?? ''} placeholder="123456789 RT0001" /></Field>
            <Field label="QST number" htmlFor="qst_number" hint="Quebec only."><Input id="qst_number" name="qst_number" defaultValue={org?.qst_number ?? ''} /></Field>
            <Field label="Website" htmlFor="website" className="sm:col-span-2"><Input id="website" name="website" defaultValue={org?.website ?? ''} /></Field>
            <Field label="Street address" htmlFor="street" className="sm:col-span-2"><Input id="street" name="street" defaultValue={org?.street ?? ''} /></Field>
            <Field label="City" htmlFor="city"><Input id="city" name="city" defaultValue={org?.city ?? ''} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Province" htmlFor="province">
                <Select id="province" name="province" defaultValue={org?.province ?? 'AB'}>
                  {PROVINCES.map(([c]) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Postal code" htmlFor="postal_code"><Input id="postal_code" name="postal_code" defaultValue={org?.postal_code ?? ''} /></Field>
            </div>
            <Field label="Time zone" htmlFor="timezone">
              <Select id="timezone" name="timezone" defaultValue={org?.timezone ?? 'America/Edmonton'}>
                {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace('America/', '').replace('_', ' ')}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2"><Button type="submit" variant="primary">Save company</Button></div>
          </ActionForm>
        </Card>

        <Card>
          <CardHeader title="Client portal defaults" description="What homeowners can see on new jobs. You can change it per job." />
          <ActionForm action={updateClientDefaults} resetOnSuccess={false} className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Schedule" htmlFor="schedule">
                <Select id="schedule" name="schedule" defaultValue={String(s.schedule ?? 'phases')}>
                  <option value="none">Hidden</option>
                  <option value="phases">Phases only</option>
                  <option value="all">All schedule items</option>
                </Select>
              </Field>
              <Field label="Show schedule this many days ahead" htmlFor="schedule_days_ahead">
                <Input id="schedule_days_ahead" name="schedule_days_ahead" type="number" min={0} max={365} defaultValue={Number(s.schedule_days_ahead ?? 30)} />
              </Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {check('submit_change_orders', 'Can request change orders')}
              {check('submit_warranty_claims', 'Can submit warranty claims')}
              {check('see_locked_selections', 'Sees locked selections')}
              {check('job_price_summary', 'Sees job price summary')}
              {check('invoices', 'Sees invoices')}
              {check('purchase_orders', 'Sees purchase orders and bills')}
              {check('budget', 'Sees the budget')}
              {check('pm_contact', 'Sees project manager contact info')}
            </div>
            <label className="flex items-center gap-2 border-t border-border pt-3 text-[13px] font-medium">
              <input type="checkbox" name="apply_existing" className="accent-brand" /> Also apply to all existing jobs
            </label>
            <Button type="submit" variant="primary">Save defaults</Button>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}
