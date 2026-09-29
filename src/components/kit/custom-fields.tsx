import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ActionForm } from './action-form'
import { formatField, opts, type CustomFieldModule, type FieldDef } from '@/lib/custom-fields'
import { saveCustomFields } from '@/app/(app)/custom-fields/actions'

/** A record's custom fields: read-only for portals, a form for people who can edit the record. */
export async function CustomFields({ module, recordId, orgId, path, canEdit, audience = 'internal' }: {
  module: CustomFieldModule; recordId: string; orgId: string; path: string; canEdit: boolean; audience?: 'internal' | 'sub' | 'client'
}) {
  const supabase = await createClient()
  const [{ data: defRows }, { data: vals }] = await Promise.all([
    supabase.from('custom_field_defs').select('id,label,data_type,options,tooltip,is_required,visible_to_subs,visible_to_clients')
      .eq('org_id', orgId).eq('module', module).eq('is_active', true).neq('data_type', 'file').order('sort').order('label'),
    supabase.from('custom_field_values').select('def_id,value').eq('record_id', recordId),
  ])
  const defs = ((defRows ?? []) as FieldDef[]).filter((d) => audience === 'internal' || (audience === 'sub' ? d.visible_to_subs : d.visible_to_clients))
  if (!defs.length) return null
  const value = new Map((vals ?? []).map((v) => [v.def_id, v.value as unknown]))
  const shownTo = (d: FieldDef) => [d.visible_to_subs && 'subs', d.visible_to_clients && 'clients'].filter(Boolean).join(' & ')

  if (!canEdit) {
    const shown = defs.filter((d) => value.has(d.id))
    if (!shown.length) return null
    return (
      <Card>
        <CardHeader title="Details" />
        <dl className="grid gap-x-6 gap-y-2 p-4 text-[13px] sm:grid-cols-2">
          {shown.map((d) => (
            <div key={d.id}><dt className="text-xs text-text-3">{d.label}</dt><dd className="whitespace-pre-wrap">{d.data_type === 'hyperlink'
              ? <a href={String(value.get(d.id))} target="_blank" rel="noreferrer noopener" className="text-brand hover:underline">{String(value.get(d.id))}</a>
              : formatField(d, value.get(d.id))}</dd></div>
          ))}
        </dl>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Custom fields" description="Set up fields in Settings → Custom fields." />
      <ActionForm action={saveCustomFields.bind(null, module, recordId, orgId, path)} resetOnSuccess={false} className="grid gap-3 p-4 sm:grid-cols-2">
        {defs.map((d) => {
          const v = value.get(d.id)
          const name = `cf_${d.id}`
          const label = (
            <span className="flex items-center gap-2">{d.label}{d.is_required && <span className="text-danger">*</span>}
              {shownTo(d) && <Badge className="text-[11px]">Shown to {shownTo(d)}</Badge>}</span>
          )
          const common = { name, 'aria-label': d.label, title: d.tooltip ?? undefined, className: 'mt-1' }
          let input: React.ReactNode
          switch (d.data_type) {
            case 'long_text': input = <Textarea {...common} rows={3} maxLength={8000} defaultValue={v == null ? '' : String(v)} />; break
            case 'number': input = <Input {...common} type="number" step="any" defaultValue={v == null ? '' : String(v)} />; break
            case 'currency': input = <Input {...common} inputMode="decimal" placeholder="$0.00" defaultValue={v == null ? '' : String(v)} />; break
            case 'date': input = <Input {...common} type="date" defaultValue={v == null ? '' : String(v)} />; break
            case 'hyperlink': input = <Input {...common} type="url" placeholder="https://" defaultValue={v == null ? '' : String(v)} />; break
            case 'boolean': input = <span className="mt-2 flex items-center gap-2"><Checkbox name={name} aria-label={d.label} defaultChecked={v === true} /> Yes</span>; break
            case 'single_select': input = (
              <Select {...common} defaultValue={v == null ? '' : String(v)}><option value="">—</option>{opts(d).map((o) => <option key={o} value={o}>{o}</option>)}</Select>
            ); break
            case 'multi_select': input = (
              <span className="mt-1 flex flex-wrap gap-3">{opts(d).map((o) => (
                <label key={o} className="flex items-center gap-1.5 font-normal"><Checkbox name={name} value={o} defaultChecked={Array.isArray(v) && v.includes(o)} />{o}</label>
              ))}</span>
            ); break
            default: input = <Input {...common} maxLength={500} defaultValue={v == null ? '' : String(v)} />
          }
          const cls = `text-[13px] font-medium text-text-2 ${d.data_type === 'long_text' ? 'sm:col-span-2' : ''}`
          return d.data_type === 'multi_select' || d.data_type === 'boolean'
            ? <div key={d.id} role="group" aria-label={d.label} className={cls}>{label}{input}</div>
            : <label key={d.id} className={cls}>{label}{input}</label>
        })}
        <div className="sm:col-span-2"><Button type="submit">Save fields</Button></div>
      </ActionForm>
    </Card>
  )
}
