'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Filter } from 'lucide-react'
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { DATE_PRESETS } from '@/lib/date-range'

export type FilterDef =
  | { type: 'text'; name: string; label: string; placeholder?: string }
  | { type: 'multi'; name: string; label: string; options: { value: string; label: string }[] }
  | { type: 'select'; name: string; label: string; options: { value: string; label: string }[] }
  | { type: 'date'; name: string; label: string }
  | { type: 'files'; name: string; label: string }

/** URL-driven filter drawer shared by every list. Values live in the query string. */
export function FilterDrawer({ filters }: { filters: FilterDef[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)

  const initial = () => {
    const v: Record<string, string | string[]> = {}
    for (const f of filters) {
      if (f.type === 'multi') v[f.name] = params.getAll(f.name)
      else if (f.type === 'date') {
        v[f.name] = params.get(f.name) ?? 'all'
        v[f.name + '_from'] = params.get(f.name + '_from') ?? ''
        v[f.name + '_to'] = params.get(f.name + '_to') ?? ''
      } else v[f.name] = params.get(f.name) ?? ''
    }
    return v
  }
  const [values, setValues] = useState(initial)

  const active = filters.reduce((n, f) => {
    if (f.type === 'multi') return n + (params.getAll(f.name).length > 0 ? 1 : 0)
    if (f.type === 'date') return n + (params.get(f.name) && params.get(f.name) !== 'all' ? 1 : 0)
    return n + (params.get(f.name) ? 1 : 0)
  }, 0)

  function apply(next: Record<string, string | string[]>) {
    const sp = new URLSearchParams(params.toString())
    for (const f of filters) {
      sp.delete(f.name); sp.delete(f.name + '_from'); sp.delete(f.name + '_to')
    }
    sp.delete('page')
    for (const [k, v] of Object.entries(next)) {
      if (Array.isArray(v)) v.forEach((x) => sp.append(k, x))
      else if (v && v !== 'all') sp.set(k, v)
    }
    router.push(`${pathname}?${sp.toString()}`)
    setOpen(false)
  }

  const set = (k: string, v: string | string[]) => setValues((cur) => ({ ...cur, [k]: v }))

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setValues(initial()) }}>
      <DialogTrigger asChild>
        <Button>
          <Filter /> Filter
          {active > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">{active}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent title="Filter your results" side="right">
        <form
          className="flex h-full flex-col"
          onSubmit={(e) => { e.preventDefault(); apply(values) }}
        >
          <div className="flex-1 space-y-4 p-4">
            {filters.map((f) => {
              if (f.type === 'text') return (
                <Field key={f.name} label={f.label} htmlFor={`f-${f.name}`}>
                  <Input id={`f-${f.name}`} value={values[f.name] as string} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
                </Field>
              )
              if (f.type === 'select' || f.type === 'files') {
                const options = f.type === 'files'
                  ? [{ value: 'with', label: 'Files attached' }, { value: 'without', label: 'No files attached' }]
                  : f.options
                return (
                  <Field key={f.name} label={f.label} htmlFor={`f-${f.name}`}>
                    <Select id={`f-${f.name}`} value={values[f.name] as string} onChange={(e) => set(f.name, e.target.value)}>
                      <option value="">All</option>
                      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </Field>
                )
              }
              if (f.type === 'multi') {
                const cur = values[f.name] as string[]
                const all = cur.length === f.options.length
                return (
                  <fieldset key={f.name}>
                    <legend className="mb-1 text-[13px] font-medium text-text-2">{f.label}</legend>
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                      <label className="flex items-center gap-2 text-[13px] font-medium">
                        <input type="checkbox" className="accent-brand" checked={all}
                          onChange={() => set(f.name, all ? [] : f.options.map((o) => o.value))} />
                        Select all
                      </label>
                      {f.options.map((o) => (
                        <label key={o.value} className="flex items-center gap-2 text-[13px]">
                          <input type="checkbox" className="accent-brand" checked={cur.includes(o.value)}
                            onChange={() => set(f.name, cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value])} />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )
              }
              // date range
              const preset = values[f.name] as string
              return (
                <div key={f.name}>
                  <Field label={f.label} htmlFor={`f-${f.name}`}>
                    <Select id={`f-${f.name}`} value={preset} onChange={(e) => set(f.name, e.target.value)}>
                      {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </Select>
                  </Field>
                  {preset === 'custom' && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Input type="date" aria-label={`${f.label} from`} value={values[f.name + '_from'] as string} onChange={(e) => set(f.name + '_from', e.target.value)} />
                      <Input type="date" aria-label={`${f.label} to`} value={values[f.name + '_to'] as string} onChange={(e) => set(f.name + '_to', e.target.value)} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border p-3">
            <Button type="button" variant="ghost" onClick={() => apply({})}>Clear all</Button>
            <div className="flex gap-2">
              <DialogClose asChild><Button type="button">Close</Button></DialogClose>
              <Button type="submit" variant="primary">Apply filter</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
