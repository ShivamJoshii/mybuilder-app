'use client'
import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, FolderPlus, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { cn, formatCAD } from '@/lib/utils'
import { COST_TYPES, MARKED_AS, itemCost, itemPrice, totals, type CostType, type EstGroup, type EstItem, type MarkedAs, type MarkupType } from '@/lib/estimate'
import { PROVINCE_TAX } from '@/lib/tax'

type Row = Omit<EstItem, 'quantity' | 'unit_cost' | 'markup_value'> & { quantity: string; unit_cost: string; markup_value: string }
type Settings = { default_markup_pct: string; tax_rate: string; tax_label: string }
export type CatalogItem = { id: string; title: string; description: string | null; unit: string; unit_cost: number; cost_type: CostType; markup_type: MarkupType; markup_value: number; taxable: boolean; cost_code_id: string | null }
export type CostCode = { id: string; code: string; title: string }

const toRow = (i: EstItem): Row => ({ ...i, quantity: String(i.quantity), unit_cost: String(i.unit_cost), markup_value: String(i.markup_value) })
const toItem = (r: Row): EstItem => ({ ...r, quantity: Number(r.quantity) || 0, unit_cost: Number(r.unit_cost) || 0, markup_value: Number(r.markup_value) || 0 })
const UNGROUPED = '__none'

export type SaveResult = { ok?: true; error?: string }
export type WorksheetPayload = { settings: { default_markup_pct: number; tax_rate: number; tax_label: string }; groups: EstGroup[]; items: EstItem[] }

/** Cost/markup/price worksheet shared by estimates (with groups) and change orders (flat). */
export function Worksheet({
  save: saveAction, initial, codes, catalog, editable, withGroups = true, saveLabel = 'Save estimate',
}: {
  save: (payload: WorksheetPayload) => Promise<SaveResult>
  initial: { settings: { default_markup_pct: number; tax_rate: number; tax_label: string }; groups: EstGroup[]; items: EstItem[] }
  codes: CostCode[]; catalog: CatalogItem[]; editable: boolean; withGroups?: boolean; saveLabel?: string
}) {
  const [settings, setSettings] = useState<Settings>({
    default_markup_pct: String(initial.settings.default_markup_pct), tax_rate: String(initial.settings.tax_rate), tax_label: initial.settings.tax_label,
  })
  const [groups, setGroups] = useState<EstGroup[]>(initial.groups)
  const [rows, setRows] = useState<Row[]>(initial.items.map(toRow))
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({})
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const items = useMemo(() => rows.map(toItem), [rows])
  const t = totals(items, groups, Number(settings.tax_rate) || 0)
  const touch = () => { setDirty(true); setMsg({}) }

  const setRow = (id: string, patch: Partial<Row>) => { touch(); setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))) }
  const setGroup = (id: string, patch: Partial<EstGroup>) => { touch(); setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g))) }
  const nextSort = () => rows.reduce((m, r) => Math.max(m, r.sort), 0) + 1
  const addRow = (groupId: string | null, from?: CatalogItem) => {
    touch()
    const id = crypto.randomUUID()
    setRows((rs) => [...rs, {
      id, group_id: groupId, cost_code_id: from?.cost_code_id ?? null, cost_type: from?.cost_type ?? 'material',
      title: from?.title ?? '', description: from?.description ?? null, internal_notes: null,
      quantity: '1', unit: from?.unit ?? 'ea', unit_cost: String(from?.unit_cost ?? 0),
      markup_type: from?.markup_type ?? 'percent', markup_value: String(from ? from.markup_value : settings.default_markup_pct),
      taxable: from?.taxable ?? true, marked_as: 'none', sort: nextSort(),
    }])
    setTimeout(() => document.getElementById(`title-${id}`)?.focus(), 0)
  }
  const addGroup = () => {
    touch()
    const id = crypto.randomUUID()
    setGroups((gs) => [...gs, { id, name: `Group ${gs.length + 1}`, sort: gs.reduce((m, g) => Math.max(m, g.sort), 0) + 1, is_optional: false, option_status: 'pending' }])
    setTimeout(() => document.getElementById(`group-${id}`)?.focus(), 0)
  }
  const removeGroup = (id: string) => { touch(); setGroups((gs) => gs.filter((g) => g.id !== id)); setRows((rs) => rs.filter((r) => r.group_id !== id)) }

  const save = () => start(async () => {
    const res = await saveAction({
      settings: { default_markup_pct: Number(settings.default_markup_pct) || 0, tax_rate: Number(settings.tax_rate) || 0, tax_label: settings.tax_label },
      groups, items: items.map((i) => ({ ...i, description: i.description || null, internal_notes: i.internal_notes || null })),
    })
    if (res.error) setMsg({ error: res.error })
    else { setDirty(false); setMsg({ ok: withGroups ? 'Estimate saved.' : 'Saved.' }) }
  })

  const sections: { id: string; group: EstGroup | null }[] = [
    ...[...groups].sort((a, b) => a.sort - b.sort).map((g) => ({ id: g.id, group: g })),
    ...(rows.some((r) => !r.group_id) || groups.length === 0 ? [{ id: UNGROUPED, group: null }] : []),
  ]
  const ro = !editable

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Builder cost" value={formatCAD(t.cost)} />
        <Stat label="Markup" value={formatCAD(t.profit)} sub={`${t.margin}% margin`} />
        <Stat label="Client price" value={formatCAD(t.price)} />
        <Stat label={settings.tax_label || 'Tax'} value={formatCAD(t.tax)} sub={`${settings.tax_rate || 0}%`} />
        <Stat label="Total with tax" value={formatCAD(t.total)} strong />
        <Card className="flex flex-col justify-center gap-1 p-3 text-xs text-text-3">
          <span>{withGroups ? 'Optional groups are left out of totals until approved.' : 'Use a negative quantity for credits.'}</span>
        </Card>
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-3">
        <label className="text-xs text-text-3">Default markup %
          <Input type="number" step="0.1" min="0" className="mt-1 w-28" value={settings.default_markup_pct} disabled={ro}
            onChange={(e) => { touch(); setSettings({ ...settings, default_markup_pct: e.target.value }) }} />
        </label>
        <label className="text-xs text-text-3">Tax preset
          <Select className="mt-1 w-48" disabled={ro} value="" aria-label="Tax preset"
            onChange={(e) => { const p = PROVINCE_TAX[e.target.value]; if (p) { touch(); setSettings({ ...settings, tax_rate: String(p.rate), tax_label: p.label }) } }}>
            <option value="">Pick a province…</option>
            {Object.entries(PROVINCE_TAX).map(([k, v]) => <option key={k} value={k}>{k} — {v.label} {v.rate}%</option>)}
          </Select>
        </label>
        <label className="text-xs text-text-3">Tax label
          <Input className="mt-1 w-28" value={settings.tax_label} disabled={ro} onChange={(e) => { touch(); setSettings({ ...settings, tax_label: e.target.value }) }} />
        </label>
        <label className="text-xs text-text-3">Tax rate %
          <Input type="number" step="0.001" min="0" max="100" className="mt-1 w-28" value={settings.tax_rate} disabled={ro}
            onChange={(e) => { touch(); setSettings({ ...settings, tax_rate: e.target.value }) }} />
        </label>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-warning">Unsaved changes</span>}
          {editable && <Button variant="primary" onClick={save} disabled={pending || !dirty}><Save />{pending ? 'Saving…' : saveLabel}</Button>}
        </div>
      </Card>
      {msg.error && <Alert>{msg.error}</Alert>}
      {msg.ok && <Alert tone="success">{msg.ok}</Alert>}

      {sections.map(({ id, group }) => {
        const gRows = rows.filter((r) => (group ? r.group_id === group.id : !r.group_id)).sort((a, b) => a.sort - b.sort)
        const gItems = gRows.map(toItem)
        const gPrice = gItems.reduce((s, i) => s + itemPrice(i), 0)
        return (
          <Card key={id} className="overflow-x-auto" data-group={group?.name ?? 'Items'}>
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
              {group ? (
                <>
                  <Input id={`group-${group.id}`} aria-label="Group name" className="h-8 w-64 font-medium" value={group.name} disabled={ro} onChange={(e) => setGroup(group.id, { name: e.target.value })} />
                  <label className="flex items-center gap-1.5 text-xs text-text-2">
                    <Checkbox checked={group.is_optional} disabled={ro} onChange={(e) => setGroup(group.id, { is_optional: e.target.checked })} /> Optional
                  </label>
                  {group.is_optional && (
                    <Select aria-label="Option status" className="h-8 w-32" value={group.option_status} disabled={ro} onChange={(e) => setGroup(group.id, { option_status: e.target.value as EstGroup['option_status'] })}>
                      <option value="pending">Pending</option><option value="approved">Approved</option><option value="declined">Declined</option>
                    </Select>
                  )}
                </>
              ) : <span className="px-1 text-[13px] font-medium">{groups.length ? 'Ungrouped items' : 'Line items'}</span>}
              <span className="ml-auto text-[13px] tabular-nums text-text-2">{formatCAD(gPrice)}</span>
              {group && editable && <Button variant="ghost" size="sm" aria-label={`Delete group ${group.name}`} onClick={() => removeGroup(group.id)}><Trash2 /></Button>}
            </div>
            <table className="w-full min-w-[1100px] text-[13px]">
              <thead className="text-left text-xs text-text-3">
                <tr>
                  <th className="w-6" /><th className="px-2 py-1.5">Title</th><th className="px-2 py-1.5">Cost code</th><th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5 text-right">Qty</th><th className="px-2 py-1.5">Unit</th><th className="px-2 py-1.5 text-right">Unit cost</th>
                  <th className="px-2 py-1.5 text-right">Builder cost</th><th className="px-2 py-1.5">Markup</th><th className="px-2 py-1.5 text-right">Client price</th>
                  <th className="px-2 py-1.5">Tax</th>{withGroups && <th className="px-2 py-1.5">Marked as</th>}<th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {gRows.map((r) => {
                  const it = toItem(r)
                  const isOpen = open.has(r.id)
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-t border-border align-middle" data-line={r.title}>
                        <td className="pl-2">
                          <button type="button" aria-label="Details" className="text-text-3" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })}>
                            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </button>
                        </td>
                        <td className="px-1 py-1"><Input id={`title-${r.id}`} aria-label="Line title" className="h-8 min-w-48" value={r.title} disabled={ro} onChange={(e) => setRow(r.id, { title: e.target.value })} /></td>
                        <td className="px-1 py-1">
                          <Select aria-label="Cost code" className="h-8 w-44" value={r.cost_code_id ?? ''} disabled={ro} onChange={(e) => setRow(r.id, { cost_code_id: e.target.value || null })}>
                            <option value="">—</option>{codes.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
                          </Select>
                        </td>
                        <td className="px-1 py-1">
                          <Select aria-label="Cost type" className="h-8 w-32" value={r.cost_type} disabled={ro} onChange={(e) => setRow(r.id, { cost_type: e.target.value as CostType })}>
                            {COST_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </Select>
                        </td>
                        <td className="px-1 py-1"><Input aria-label="Quantity" type="number" step="any" className="h-8 w-20 text-right" value={r.quantity} disabled={ro} onChange={(e) => setRow(r.id, { quantity: e.target.value })} /></td>
                        <td className="px-1 py-1"><Input aria-label="Unit" className="h-8 w-16" value={r.unit} disabled={ro} onChange={(e) => setRow(r.id, { unit: e.target.value })} /></td>
                        <td className="px-1 py-1"><Input aria-label="Unit cost" type="number" step="0.01" min="0" className="h-8 w-28 text-right" value={r.unit_cost} disabled={ro} onChange={(e) => setRow(r.id, { unit_cost: e.target.value })} /></td>
                        <td className="px-2 py-1 text-right tabular-nums">{formatCAD(itemCost(it))}</td>
                        <td className="px-1 py-1">
                          <div className="flex">
                            <Input aria-label="Markup" type="number" step="0.01" className="h-8 w-20 rounded-r-none text-right" value={r.markup_value} disabled={ro} onChange={(e) => setRow(r.id, { markup_value: e.target.value })} />
                            <Select aria-label="Markup type" className="h-8 w-14 rounded-l-none border-l-0 px-1" value={r.markup_type} disabled={ro} onChange={(e) => setRow(r.id, { markup_type: e.target.value as MarkupType })}>
                              <option value="percent">%</option><option value="amount">$</option>
                            </Select>
                          </div>
                        </td>
                        <td className="px-2 py-1 text-right font-medium tabular-nums" data-price>{formatCAD(itemPrice(it))}</td>
                        <td className="px-2 py-1"><Checkbox aria-label="Taxable" checked={r.taxable} disabled={ro} onChange={(e) => setRow(r.id, { taxable: e.target.checked })} /></td>
                        {withGroups && <td className="px-1 py-1">
                          <Select aria-label="Marked as" className="h-8 w-28" value={r.marked_as} disabled={ro} onChange={(e) => setRow(r.id, { marked_as: e.target.value as MarkedAs })}>
                            {MARKED_AS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </Select>
                        </td>}
                        <td className="pr-2">{editable && <Button variant="ghost" size="sm" aria-label={`Delete line ${r.title}`} onClick={() => { touch(); setRows((rs) => rs.filter((x) => x.id !== r.id)) }}><Trash2 /></Button>}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-surface-2/50">
                          <td />
                          <td colSpan={6} className="px-1 pb-2">
                            <label className="text-xs text-text-3">Description (client sees this)
                              <Textarea rows={2} className="mt-1" value={r.description ?? ''} disabled={ro} maxLength={4000} onChange={(e) => setRow(r.id, { description: e.target.value })} />
                            </label>
                          </td>
                          <td colSpan={6} className="px-1 pb-2">
                            <label className="text-xs text-text-3">Internal notes
                              <Textarea rows={2} className="mt-1" value={r.internal_notes ?? ''} disabled={ro} maxLength={4000} onChange={(e) => setRow(r.id, { internal_notes: e.target.value })} />
                            </label>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {gRows.length === 0 && <tr><td colSpan={13} className="px-3 py-3 text-text-3">No lines yet.</td></tr>}
              </tbody>
            </table>
            {editable && (
              <div className="flex flex-wrap gap-2 border-t border-border p-2">
                <Button size="sm" onClick={() => addRow(group?.id ?? null)}><Plus />Add line</Button>
                {catalog.length > 0 && (
                  <Select aria-label="Add from catalog" className="h-8 w-56" value="" onChange={(e) => { const c = catalog.find((x) => x.id === e.target.value); if (c) addRow(group?.id ?? null, c) }}>
                    <option value="">Add from catalog…</option>
                    {catalog.map((c) => <option key={c.id} value={c.id}>{c.title} ({formatCAD(c.unit_cost)}/{c.unit})</option>)}
                  </Select>
                )}
              </div>
            )}
          </Card>
        )
      })}
      {editable && withGroups && <Button onClick={addGroup}><FolderPlus />Add group</Button>}
    </div>
  )
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-text-3">{label}</div>
      <div className={cn('tabular-nums', strong ? 'text-lg font-semibold' : 'text-base font-medium')}>{value}</div>
      {sub && <div className="text-xs text-text-3">{sub}</div>}
    </Card>
  )
}
