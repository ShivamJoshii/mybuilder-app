'use client'
import { useState, useTransition } from 'react'
import { FileCheck2, Percent, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { formatCAD } from '@/lib/utils'

type L = { key: string; kind: 'amount' | 'percent' | 'change_order'; change_order_id: string | null; title: string; percent: string; amount: string; taxable: boolean }
export type InvLine = { kind: L['kind']; change_order_id: string | null; title: string; percent: number | null; amount: number; taxable: boolean; sort: number }

export function InvoiceLines({ initial, contract, billedBefore, cos, taxRate, taxLabel, holdbackPct, save }: {
  initial: InvLine[]; contract: number; billedBefore: number; cos: { id: string; number: number; title: string; subtotal: number }[]
  taxRate: number; taxLabel: string; holdbackPct: number; save: (lines: InvLine[]) => Promise<{ ok?: true; error?: string }>
}) {
  const [rows, setRows] = useState<L[]>(initial.map((l, i) => ({ key: String(i), kind: l.kind, change_order_id: l.change_order_id, title: l.title, percent: l.percent != null ? String(l.percent) : '', amount: String(l.amount), taxable: l.taxable })))
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const [coPick, setCoPick] = useState('')
  const set = (k: string, p: Partial<L>) => { setDirty(true); setMsg({}); setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...p } : r))) }
  const add = (r: Omit<L, 'key'>) => { setDirty(true); setRows((rs) => [...rs, { ...r, key: crypto.randomUUID() }]) }
  const amt = (r: L) => (r.kind === 'percent' ? Math.round(contract * (Number(r.percent) || 0)) / 100 : Number(r.amount) || 0)
  const sub = rows.reduce((s, r) => s + amt(r), 0)
  const tax = Math.round(rows.filter((r) => r.taxable).reduce((s, r) => s + amt(r), 0) * taxRate) / 100
  const hb = Math.round(sub * holdbackPct) / 100
  const used = new Set(rows.map((r) => r.change_order_id).filter(Boolean))
  const doSave = () => start(async () => {
    const r = await save(rows.map((x, i) => ({ kind: x.kind, change_order_id: x.change_order_id, title: x.title, percent: x.kind === 'percent' ? Number(x.percent) || 0 : null, amount: amt(x), taxable: x.taxable, sort: i })))
    if (r.error) setMsg({ error: r.error }); else { setDirty(false); setMsg({ ok: 'Lines saved.' }) }
  })
  const pctBefore = contract ? Math.round((billedBefore / contract) * 1000) / 10 : 0

  return (
    <Card className="overflow-x-auto">
      <div className="flex flex-wrap gap-4 border-b border-border px-4 py-2 text-[13px] text-text-2">
        <span>Contract <span className="font-medium tabular-nums">{formatCAD(contract)}</span></span>
        <span>Invoiced before this <span className="font-medium tabular-nums">{formatCAD(billedBefore)}</span> ({pctBefore}%)</span>
        <span>Left to invoice <span className="font-medium tabular-nums">{formatCAD(contract - billedBefore - sub)}</span></span>
      </div>
      {msg.error && <Alert className="m-3">{msg.error}</Alert>}
      {msg.ok && <Alert tone="success" className="m-3">{msg.ok}</Alert>}
      <table className="w-full text-[13px]">
        <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="px-3 py-2">Description</th><th className="px-3 py-2">Basis</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Tax</th><th className="w-8" /></tr></thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-2 py-1"><Input aria-label="Line description" className="h-8" value={r.title} maxLength={200} onChange={(e) => set(r.key, { title: e.target.value })} /></td>
              <td className="px-2 py-1 text-text-3">
                {r.kind === 'percent' ? (
                  <span className="flex items-center gap-1"><Input aria-label="Percent of contract" type="number" step="0.01" className="h-8 w-20 text-right" value={r.percent} onChange={(e) => set(r.key, { percent: e.target.value })} />% of contract</span>
                ) : r.kind === 'change_order' ? 'Change order' : 'Fixed amount'}
              </td>
              <td className="px-2 py-1 text-right">
                {r.kind === 'amount' ? <Input aria-label="Line amount" type="number" step="0.01" className="ml-auto h-8 w-32 text-right" value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value })} />
                  : <span className="tabular-nums">{formatCAD(amt(r))}</span>}
              </td>
              <td className="px-2 py-1"><Checkbox aria-label="Taxable" checked={r.taxable} onChange={(e) => set(r.key, { taxable: e.target.checked })} /></td>
              <td className="pr-2"><Button size="sm" variant="ghost" aria-label="Remove line" onClick={() => { setDirty(true); setRows((rs) => rs.filter((x) => x.key !== r.key)) }}><Trash2 /></Button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-3 text-text-3">Add a draw, a fixed amount or an approved change order.</td></tr>}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2 border-t border-border p-2">
        <Button size="sm" onClick={() => add({ kind: 'percent', change_order_id: null, title: `Progress draw`, percent: '10', amount: '0', taxable: true })}><Percent />% of contract</Button>
        <Button size="sm" onClick={() => add({ kind: 'amount', change_order_id: null, title: '', percent: '', amount: '', taxable: true })}><Plus />Fixed amount</Button>
        {cos.filter((c) => !used.has(c.id)).length > 0 && (
          <span className="flex items-center gap-1">
            <Select aria-label="Approved change order" className="h-8 w-60" value={coPick} onChange={(e) => setCoPick(e.target.value)}>
              <option value="">Approved change order…</option>
              {cos.filter((c) => !used.has(c.id)).map((c) => <option key={c.id} value={c.id}>#{c.number} {c.title} ({formatCAD(c.subtotal)})</option>)}
            </Select>
            <Button size="sm" disabled={!coPick} onClick={() => { const c = cos.find((x) => x.id === coPick)!; add({ kind: 'change_order', change_order_id: c.id, title: `Change order #${c.number}: ${c.title}`, percent: '', amount: String(c.subtotal), taxable: true }); setCoPick('') }}><FileCheck2 />Add</Button>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-warning">Unsaved changes</span>}
          <Button size="sm" variant="primary" onClick={doSave} disabled={pending || !dirty}><Save />{pending ? 'Saving…' : 'Save lines'}</Button>
        </div>
      </div>
      <div className="ml-auto w-full max-w-xs space-y-1 border-t border-border p-4 text-[13px]">
        <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCAD(sub)}</span></div>
        <div className="flex justify-between"><span>{taxLabel} ({taxRate}%)</span><span className="tabular-nums">{formatCAD(tax)}</span></div>
        {hb > 0 && <div className="flex justify-between"><span>Holdback ({holdbackPct}%)</span><span className="tabular-nums">−{formatCAD(hb)}</span></div>}
        <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Amount due</span><span className="tabular-nums">{formatCAD(sub + tax - hb)}</span></div>
      </div>
    </Card>
  )
}
