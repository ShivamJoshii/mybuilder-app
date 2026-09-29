import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import { requireBuilder } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { costCodes } from '@/lib/financial'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { ActionForm } from '@/components/kit/action-form'
import { COST_TYPES } from '@/lib/estimate'
import { todayIn } from '@/lib/utils'
import { saveAccounting } from '../actions'

export const metadata: Metadata = { title: 'Accounting' }

const DEFAULTS: Record<string, string> = { labor: 'Job Labour', material: 'Job Materials', subcontractor: 'Subcontractors', equipment: 'Equipment Rental', other: 'Job Expenses', none: 'Job Expenses' }

export default async function AccountingPage() {
  const ctx = await requireBuilder('accounting')
  const supabase = await createClient()
  const [{ data: s }, codes] = await Promise.all([
    supabase.from('accounting_settings').select('*').eq('org_id', ctx.workspace.orgId).maybeSingle(),
    costCodes(ctx.workspace.orgId),
  ])
  const accounts = { ...DEFAULTS, ...((s?.accounts ?? {}) as Record<string, string>) }
  const codeAccounts = (s?.code_accounts ?? {}) as Record<string, string>
  const today = todayIn(ctx.tz)
  const monthStart = `${today.slice(0, 8)}01`
  return (
    <>
      <PageHeader title="Accounting" />
      <div className="max-w-4xl space-y-5 p-5">
        <Alert tone="info">Direct QuickBooks Online and Xero sync is coming. Until then, export bills and invoices here and import them into your accounting system.</Alert>
        <Card>
          <CardHeader title="Export" description="Approved and paid bills, sent invoices, and payments for a date range." />
          <form action="/accounting/export" method="get" className="flex flex-wrap items-end gap-3 p-4">
            <label className="text-[13px] font-medium text-text-2">From<Input name="from" type="date" className="mt-1" defaultValue={monthStart} /></label>
            <label className="text-[13px] font-medium text-text-2">To<Input name="to" type="date" className="mt-1" defaultValue={today} /></label>
            <Button type="submit" name="kind" value="bills"><Download />Bills (QuickBooks CSV)</Button>
            <Button type="submit" name="kind" value="invoices"><Download />Invoices (QuickBooks CSV)</Button>
            <Button type="submit" name="kind" value="payments"><Download />Payments register</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Chart of accounts mapping" description="Which expense account each kind of cost posts to. Override by cost code below." />
          <ActionForm action={saveAccounting} resetOnSuccess={false} className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Accounting system" htmlFor="system">
                <Select id="system" name="system" defaultValue={s?.system ?? 'qbo'}><option value="qbo">QuickBooks Online</option><option value="xero">Xero</option><option value="sage">Sage 50</option><option value="other">Other</option></Select>
              </Field>
              <Field label="Income product/service for invoices" htmlFor="income_item"><Input id="income_item" name="income_item" defaultValue={s?.income_item ?? 'Construction services'} maxLength={100} /></Field>
              {COST_TYPES.map((t) => (
                <Field key={t.value} label={`${t.label} costs → account`} htmlFor={`acct:${t.value}`}><Input id={`acct:${t.value}`} name={`acct:${t.value}`} defaultValue={accounts[t.value]} maxLength={100} /></Field>
              ))}
            </div>
            {codes.length > 0 && (
              <details className="rounded-md border border-border">
                <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium">Cost code overrides ({Object.keys(codeAccounts).length})</summary>
                <div className="grid gap-2 p-3 sm:grid-cols-2">
                  {codes.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-[13px]"><span className="w-40 truncate text-text-2">{c.code} {c.title}</span>
                      <Input name={`code:${c.id}`} defaultValue={codeAccounts[c.id] ?? ''} placeholder="Use type default" maxLength={100} className="h-8" /></label>
                  ))}
                </div>
              </details>
            )}
            <Button type="submit" variant="primary">Save mapping</Button>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}
