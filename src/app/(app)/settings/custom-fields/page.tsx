import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { requireBuilder, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionForm } from '@/components/kit/action-form'
import { addCustomField, toggleCustomField } from '../actions'
import { CUSTOM_FIELD_MODULES } from '@/lib/custom-fields'

export const metadata: Metadata = { title: 'Custom fields' }

const TYPES = [
  ['text', 'Text'], ['long_text', 'Long text'], ['number', 'Number'], ['currency', 'Currency'], ['date', 'Date'],
  ['boolean', 'Yes / No'], ['single_select', 'Single select'], ['multi_select', 'Multi select'], ['hyperlink', 'Link'],
] as const

export default async function CustomFieldsPage() {
  const ctx = await requireBuilder()
  if (!hasAction(ctx, 'settings.manage')) redirect('/settings/profile')
  const supabase = await createClient()
  const [{ data: fields }, { data: modules }] = await Promise.all([
    supabase.from('custom_field_defs').select('*').eq('org_id', ctx.workspace.orgId).order('module').order('sort'),
    supabase.from('app_modules').select('key,label').in('key', [...CUSTOM_FIELD_MODULES]).order('sort'),
  ])
  const label = new Map((modules ?? []).map((m) => [m.key, m.label]))
  const typeLabel = new Map<string, string>(TYPES.map(([k, v]) => [k, v]))
  return (
    <>
      <PageHeader title="Custom fields" />
      <div className="grid gap-5 p-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          {(fields ?? []).length === 0 ? (
            <EmptyState icon={ClipboardList} title="Track what matters to you" body="Add your own fields to jobs, leads, daily logs and more. They show up on forms and in filters." />
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs font-semibold text-text-2">
                <tr><th className="px-3 py-2">Field</th><th className="px-3 py-2">Module</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Visible to</th><th /></tr>
              </thead>
              <tbody>
                {(fields ?? []).map((f) => (
                  <tr key={f.id} className="border-t border-border">
                    <td className={`px-3 py-2 font-medium ${f.is_active ? '' : 'text-text-3 line-through'}`}>{f.label}{f.is_required && <span className="text-danger"> *</span>}</td>
                    <td className="px-3 py-2">{label.get(f.module)}</td>
                    <td className="px-3 py-2">{typeLabel.get(f.data_type)}</td>
                    <td className="px-3 py-2 space-x-1"><Badge>Team</Badge>{f.visible_to_subs && <Badge>Subs</Badge>}{f.visible_to_clients && <Badge>Clients</Badge>}</td>
                    <td className="px-3 py-1 text-right">
                      <form action={toggleCustomField.bind(null, f.id, !f.is_active)}><Button type="submit" size="sm" variant="ghost">{f.is_active ? 'Turn off' : 'Turn on'}</Button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card>
          <CardHeader title="Add a field" />
          <ActionForm action={addCustomField} className="space-y-3 p-4">
            <Field label="Module" htmlFor="module">
              <Select id="module" name="module" defaultValue="jobs">{(modules ?? []).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select>
            </Field>
            <Field label="Label" htmlFor="label" required><Input id="label" name="label" required maxLength={60} /></Field>
            <Field label="Type" htmlFor="data_type">
              <Select id="data_type" name="data_type">{TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </Field>
            <Field label="Options" htmlFor="options" hint="For select fields: one option per line.">
              <Textarea id="options" name="options" className="min-h-16" />
            </Field>
            <Field label="Tooltip" htmlFor="tooltip"><Input id="tooltip" name="tooltip" /></Field>
            <div className="grid gap-1.5 text-[13px]">
              <label className="flex items-center gap-2"><input type="checkbox" name="is_required" className="accent-brand" />Required</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="is_filterable" defaultChecked className="accent-brand" />Show in filters</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="visible_to_subs" className="accent-brand" />Visible to subs</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="visible_to_clients" className="accent-brand" />Visible to clients</label>
            </div>
            <Button type="submit" variant="primary">Add field</Button>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}
