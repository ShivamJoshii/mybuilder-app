'use client'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { formatCAD } from '@/lib/utils'
import type { ActionState } from '@/components/kit/action-form'

type Item = { id: string; title: string; description: string | null; quantity: number; unit: string }

export function PricingForm({ action, items, prices, notes, open }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  items: Item[]; prices: Record<string, { unit_cost: number; notes: string | null }>; notes: string; open: boolean
}) {
  const [state, formAction, pending] = useActionState(action, {})
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(items.map((i) => [i.id, prices[i.id] ? String(prices[i.id].unit_cost) : ''])))
  const total = items.reduce((s, i) => s + Math.round(i.quantity * (Number(vals[i.id]) || 0) * 100) / 100, 0)
  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      <table className="w-full text-[13px]">
        <thead className="text-left text-xs text-text-3"><tr><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit price</th><th className="py-2 text-right">Total</th><th className="py-2 pl-3">Note</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-t border-border align-top">
              <td className="py-2 pr-2">{i.title}{i.description && <div className="text-xs text-text-3">{i.description}</div>}</td>
              <td className="py-2 text-right whitespace-nowrap">{i.quantity} {i.unit}</td>
              <td className="py-2 pl-2"><Input name={`price:${i.id}`} aria-label={`Unit price for ${i.title}`} type="number" step="0.01" min="0" required disabled={!open}
                className="ml-auto h-8 w-32 text-right" value={vals[i.id]} onChange={(e) => setVals({ ...vals, [i.id]: e.target.value })} /></td>
              <td className="py-2 text-right tabular-nums">{formatCAD(i.quantity * (Number(vals[i.id]) || 0))}</td>
              <td className="py-2 pl-3"><Input name={`note:${i.id}`} aria-label={`Note for ${i.title}`} className="h-8" defaultValue={prices[i.id]?.notes ?? ''} maxLength={1000} disabled={!open} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="border-t border-border font-semibold"><td colSpan={3} className="py-2 text-right">Your total (before GST)</td><td className="py-2 text-right tabular-nums" data-testid="bid-total">{formatCAD(total)}</td><td /></tr></tfoot>
      </table>
      <label className="block text-[13px] font-medium text-text-2">Notes, inclusions and exclusions
        <Textarea name="notes" className="mt-1" rows={3} defaultValue={notes} maxLength={8000} disabled={!open} />
      </label>
      {open && <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Submitting…' : 'Submit bid'}</Button>}
    </form>
  )
}
