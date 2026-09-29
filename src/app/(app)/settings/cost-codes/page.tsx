import type { Metadata } from 'next'
import { requireBuilder, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ActionForm } from '@/components/kit/action-form'
import { addCostCategory, addCostCode, toggleCostCode } from '../actions'

export const metadata: Metadata = { title: 'Cost codes' }

export default async function CostCodesPage() {
  const ctx = await requireBuilder('cost_codes')
  const supabase = await createClient()
  const [{ data: cats }, { data: codes }] = await Promise.all([
    supabase.from('cost_categories').select('*').eq('org_id', ctx.workspace.orgId).order('sort').order('name'),
    supabase.from('cost_codes').select('*').eq('org_id', ctx.workspace.orgId).order('code'),
  ])
  const canAdd = can(ctx, 'cost_codes', 'add')
  const canEdit = can(ctx, 'cost_codes', 'edit')
  return (
    <>
      <PageHeader title="Cost codes" />
      <div className="grid gap-5 p-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {(cats ?? []).map((c) => {
            const list = (codes ?? []).filter((x) => x.category_id === c.id)
            return (
              <Card key={c.id}>
                <CardHeader title={c.name} description={`${list.length} codes`} />
                <table className="w-full text-[13px]">
                  <tbody>
                    {list.map((x) => (
                      <tr key={x.id} className="border-t border-border first:border-0">
                        <td className="w-24 px-4 py-1.5 font-mono text-xs">{x.code}</td>
                        <td className={`px-2 py-1.5 ${x.is_active ? '' : 'text-text-3 line-through'}`}>{x.title}</td>
                        <td className="px-2 py-1.5">{x.is_labor && <Badge tone="brand">Labour</Badge>}</td>
                        <td className="px-4 py-1 text-right">
                          {canEdit && (
                            <form action={toggleCostCode.bind(null, x.id, !x.is_active)}>
                              <Button type="submit" size="sm" variant="ghost">{x.is_active ? 'Deactivate' : 'Activate'}</Button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )
          })}
        </div>
        {canAdd && (
          <div className="space-y-5">
            <Card>
              <CardHeader title="Add a cost code" />
              <ActionForm action={addCostCode} className="space-y-3 p-4">
                <Field label="Category" htmlFor="category_id">
                  <Select id="category_id" name="category_id">{(cats ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Code" htmlFor="code" required><Input id="code" name="code" required placeholder="05-800" /></Field>
                  <Field label="Title" htmlFor="cc_title" required className="col-span-2"><Input id="cc_title" name="title" required /></Field>
                </div>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="is_labor" className="accent-brand" />Labour code (usable on time clock)</label>
                <Button type="submit" variant="primary">Add code</Button>
              </ActionForm>
            </Card>
            <Card>
              <CardHeader title="Add a category" />
              <ActionForm action={addCostCategory} className="flex gap-2 p-4">
                <Input name="name" aria-label="Category name" placeholder="e.g. Landscaping" required />
                <Button type="submit">Add</Button>
              </ActionForm>
            </Card>
            <p className="px-1 text-xs text-text-3">Codes can’t be deleted once used. Deactivate them to keep history.</p>
          </div>
        )}
      </div>
    </>
  )
}
