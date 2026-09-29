'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Plus, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'

export type QField =
  | { key: string; label: string; type: 'text' }
  | { key: string; label: string; type: 'enum'; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'date' }

const OPS: Record<QField['type'], { value: string; label: string }[]> = {
  text: [{ value: 'contains', label: 'contains' }, { value: 'is', label: 'is' }],
  enum: [{ value: 'is', label: 'is' }, { value: 'not', label: 'is not' }],
  date: [{ value: 'before', label: 'is before' }, { value: 'after', label: 'is after' }, { value: 'on', label: 'is on' }],
}

export type QRow = { field: string; op: string; value: string }

export function encodeRows(rows: QRow[]) {
  return rows.filter((r) => r.value !== '').map((r) => `${r.field}|${r.op}|${r.value}`)
}
export function decodeRows(values: string[]): QRow[] {
  return values.map((v) => { const [field, op, ...rest] = v.split('|'); return { field, op, value: rest.join('|') } }).filter((r) => r.field && r.op)
}

/**
 * Query-builder filter: rows of field + operator + value joined by AND.
 * Stored in the URL as repeated `f=field|op|value` params, so saved views work too.
 */
export function QueryBuilder({ fields, defaults }: { fields: QField[]; defaults: QRow[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const fromUrl = params.has('f') ? decodeRows(params.getAll('f')) : defaults
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<QRow[]>(fromUrl)
  const byKey = new Map(fields.map((f) => [f.key, f]))

  function apply(next: QRow[]) {
    const sp = new URLSearchParams(params.toString())
    sp.delete('f'); sp.delete('page')
    const enc = encodeRows(next)
    if (enc.length === 0) sp.append('f', '')
    enc.forEach((e) => sp.append('f', e))
    router.push(`${pathname}?${sp}`)
  }

  const count = fromUrl.filter((r) => r.value !== '').length
  return (
    <div className="w-full">
      <Button onClick={() => { setRows(fromUrl); setOpen((o) => !o) }} aria-expanded={open}>
        <SlidersHorizontal />{count > 0 ? `${count} filters applied` : 'Filters'}
      </Button>
      {open && (
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface p-3">
          {rows.map((r, i) => {
            const f = byKey.get(r.field) ?? fields[0]
            const set = (patch: Partial<QRow>) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, ...patch } : x)))
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-10 text-right text-xs font-semibold text-text-3">{i === 0 ? 'Where' : 'and'}</span>
                <Select aria-label="Field" className="w-40" value={r.field}
                  onChange={(e) => { const nf = byKey.get(e.target.value)!; set({ field: nf.key, op: OPS[nf.type][0].value, value: '' }) }}>
                  {fields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </Select>
                <Select aria-label="Operator" className="w-32" value={r.op} onChange={(e) => set({ op: e.target.value })}>
                  {OPS[f.type].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
                {f.type === 'enum' ? (
                  <Select aria-label="Value" className="w-48" value={r.value} onChange={(e) => set({ value: e.target.value })}>
                    <option value="">Choose…</option>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                ) : (
                  <Input aria-label="Value" className="w-48" type={f.type === 'date' ? 'date' : 'text'} value={r.value} onChange={(e) => set({ value: e.target.value })} />
                )}
                <Button size="icon" variant="ghost" aria-label="Remove condition" onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}><X /></Button>
              </div>
            )
          })}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setRows((cur) => [...cur, { field: fields[0].key, op: OPS[fields[0].type][0].value, value: '' }])}><Plus />Add condition</Button>
            <span className="flex-1" />
            <Button size="sm" onClick={() => { setRows([]); apply([]) }}>Clear all</Button>
            <Button size="sm" variant="primary" onClick={() => { apply(rows); setOpen(false) }}>Filter</Button>
          </div>
        </div>
      )}
    </div>
  )
}
