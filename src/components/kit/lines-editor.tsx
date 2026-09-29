'use client'
import { useEffect, useState, useTransition } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { formatCAD } from '@/lib/utils'
import { COST_TYPES, type CostType } from '@/lib/estimate'

export type Line = { id: string; cost_code_id: string | null; cost_type: CostType; title: string; description: string | null; quantity: number; unit: string; unit_cost?: number; sort: number }
type Row = Omit<Line, 'quantity' | 'unit_cost'> & { quantity: string; unit_cost: string }

/** Simple line editor for bid packages (no prices) and purchase orders (unit cost). */
export function LinesEditor({ initial, codes, withCost, editable, save, saveLabel = 'Save lines', defaultType = 'subcontractor' }: {
  initial: Line[]; codes: { id: string; code: string; title: string }[]; withCost: boolean; editable: boolean
  save: (lines: Line[]) => Promise<{ ok?: true; error?: string }>; saveLabel?: string; defaultType?: CostType
}) {
  const [rows, setRows] = useState<Row[]>(initial.map((l) => ({ ...l, quantity: String(l.quantity), unit_cost: String(l.unit_cost ?? 0) })))
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({})
  const [pending, start] = useTransition()
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
  const set = (id: string, p: Partial<Row>) => { setDirty(true); setMsg({}); setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r))) }
  const add = () => {
    setDirty(true)
    const id = crypto.randomUUID()
    setRows((rs) => [...rs, { id, cost_code_id: null, cost_type: defaultType, title: '', description: null, quantity: '1', unit: 'ls', unit_cost: '0', sort: rs.reduce((m, r) => Math.max(m, r.sort), 0) + 1 }])
    setTimeout(() => document.getElementById(`line-${id}`)?.focus(), 0)
  }
  const total = rows.reduce((s, r) => s + Math.round((Number(r.quantity) || 0) * (Number(r.unit_cost) || 0) * 100) / 100, 0)
  const doSave = () => start(async () => {
    const r = await save(rows.map((x) => ({ ...x, quantity: Number(x.quantity) || 0, unit_cost: withCost ? Number(x.unit_cost) || 0 : undefined })))
    if (r.error) setMsg({ error: r.error }); else { setDirty(false); setMsg({ ok: 'Lines saved.' }) }
  })
  const ro = !editable
  return (
    <Card className="overflow-x-auto">
      {msg.error && <Alert className="m-3">{msg.error}</Alert>}
      {msg.ok && <Alert tone="success" className="m-3">{msg.ok}</Alert>}
      <table className="w-full min-w-[820px] text-[13px]">
        <thead className="bg-surface-2 text-left text-xs text-text-3">
          <tr><th className="px-2 py-2">Item</th><th className="px-2 py-2">Cost code</th><th className="px-2 py-2">Type</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2">Unit</th>
            {withCost && <><th className="px-2 py-2 text-right">Unit cost</th><th className="px-2 py-2 text-right">Total</th></>}<th className="w-8" /></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border" data-line={r.title}>
              <td className="px-1 py-1"><Input id={`line-${r.id}`} aria-label="Line title" className="h-8 min-w-48" value={r.title} disabled={ro} maxLength={200} onChange={(e) => set(r.id, { title: e.target.value })} /></td>
              <td className="px-1 py-1">
                <Select aria-label="Cost code" className="h-8 w-44" value={r.cost_code_id ?? ''} disabled={ro} onChange={(e) => set(r.id, { cost_code_id: e.target.value || null })}>
                  <option value="">—</option>{codes.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
                </Select>
              </td>
              <td className="px-1 py-1">
                <Select aria-label="Cost type" className="h-8 w-32" value={r.cost_type} disabled={ro} onChange={(e) => set(r.id, { cost_type: e.target.value as CostType })}>
                  {COST_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
              </td>
              <td className="px-1 py-1"><Input aria-label="Quantity" type="number" step="any" className="h-8 w-20 text-right" value={r.quantity} disabled={ro} onChange={(e) => set(r.id, { quantity: e.target.value })} /></td>
              <td className="px-1 py-1"><Input aria-label="Unit" className="h-8 w-16" value={r.unit} disabled={ro} maxLength={20} onChange={(e) => set(r.id, { unit: e.target.value })} /></td>
              {withCost && <>
                <td className="px-1 py-1"><Input aria-label="Unit cost" type="number" step="0.01" className="h-8 w-28 text-right" value={r.unit_cost} disabled={ro} onChange={(e) => set(r.id, { unit_cost: e.target.value })} /></td>
                <td className="px-2 py-1 text-right tabular-nums">{formatCAD((Number(r.quantity) || 0) * (Number(r.unit_cost) || 0))}</td>
              </>}
              <td className="pr-2">{editable && <Button size="sm" variant="ghost" aria-label={`Delete line ${r.title}`} onClick={() => { setDirty(true); setRows((rs) => rs.filter((x) => x.id !== r.id)) }}><Trash2 /></Button>}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-3 text-text-3">No lines yet.</td></tr>}
        </tbody>
        {withCost && rows.length > 0 && <tfoot><tr className="border-t border-border font-medium"><td colSpan={6} className="px-2 py-2 text-right">Total</td><td className="px-2 py-2 text-right tabular-nums" data-testid="lines-total">{formatCAD(total)}</td><td /></tr></tfoot>}
      </table>
      {editable && (
        <div className="flex items-center gap-2 border-t border-border p-2">
          <Button size="sm" onClick={add}><Plus />Add line</Button>
          <span className="ml-auto text-xs text-warning">{dirty ? 'Unsaved changes' : ''}</span>
          <Button size="sm" variant="primary" onClick={doSave} disabled={pending || !dirty}><Save />{pending ? 'Saving…' : saveLabel}</Button>
        </div>
      )}
    </Card>
  )
}
