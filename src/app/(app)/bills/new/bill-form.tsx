'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { formatCAD, todayIn } from '@/lib/utils'
import { createBill } from '../actions'

type PoLine = { id: string; title: string; total: number; billed: number }
type Free = { key: string; title: string; cost_code_id: string; amount: string }

export function BillForm({ po, jobs, subs, codes, isSub }: {
  po: { id: string; job_id: string; title: string; holdback_pct: number; lien_waiver_required: boolean; lines: PoLine[]; next: number } | null
  jobs: { id: string; title: string }[]; subs: { sub_org_id: string; company_name: string }[]; codes: { id: string; code: string; title: string }[]; isSub: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [jobId, setJobId] = useState(po?.job_id ?? jobs[0]?.id ?? '')
  const [payee, setPayee] = useState('')
  const [vendor, setVendor] = useState('')
  const [ref, setRef] = useState('')
  const [title, setTitle] = useState(po ? `${po.title} — draw ${po.next}` : '')
  const [date, setDate] = useState(todayIn())
  const [due, setDue] = useState('')
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [free, setFree] = useState<Free[]>([{ key: '1', title: '', cost_code_id: '', amount: '' }])
  const [gst, setGst] = useState(true)
  const [taxOverride, setTaxOverride] = useState<string | null>(null)
  const [holdback, setHoldback] = useState(String(po?.holdback_pct ?? 0))
  const [lien, setLien] = useState(po?.lien_waiver_required ?? false)

  const subtotal = po ? po.lines.reduce((s, l) => s + (Number(amounts[l.id]) || 0), 0) : free.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const tax = taxOverride != null ? Number(taxOverride) || 0 : gst ? Math.round(subtotal * 5) / 100 : 0
  const hb = Math.round(subtotal * (Number(holdback) || 0)) / 100
  const payable = subtotal + tax - hb

  const submit = () => start(async () => {
    setError('')
    const bill = {
      job_id: jobId, po_id: po?.id ?? null, sub_org_id: !po && payee.startsWith('s:') ? payee.slice(2) : null, vendor_name: !po && payee === 'vendor' ? vendor : '',
      invoice_ref: ref, title, invoice_date: date, due_date: due, tax_amount: Math.round(tax * 100) / 100,
      holdback_pct: po ? po.holdback_pct : Number(holdback) || 0, lien_waiver_required: lien,
    }
    const items = po
      ? po.lines.map((l, i) => ({ po_item_id: l.id, cost_code_id: null, cost_type: null, title: '', amount: Number(amounts[l.id]) || 0, sort: i }))
      : free.map((l, i) => ({ po_item_id: null, cost_code_id: l.cost_code_id || null, cost_type: null, title: l.title, amount: Number(l.amount) || 0, sort: i }))
    const r = await createBill(bill, items)
    if (r.error) setError(r.error)
    else router.push(`/bills/${r.id}`)
  })

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        {!po && (
          <>
            <label className="text-[13px] font-medium text-text-2">Job
              <Select className="mt-1" value={jobId} onChange={(e) => setJobId(e.target.value)}>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</Select>
            </label>
            <label className="text-[13px] font-medium text-text-2">Sub or vendor
              <Select className="mt-1" value={payee} onChange={(e) => setPayee(e.target.value)}>
                <option value="" disabled>Pick one</option>
                {subs.map((s) => <option key={s.sub_org_id} value={`s:${s.sub_org_id}`}>{s.company_name}</option>)}
                <option value="vendor">Other vendor…</option>
              </Select>
            </label>
            {payee === 'vendor' && <label className="text-[13px] font-medium text-text-2">Vendor name<Input className="mt-1" value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={200} /></label>}
          </>
        )}
        <label className="text-[13px] font-medium text-text-2">{isSub ? 'Your invoice number' : 'Vendor invoice number'}<Input className="mt-1" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} /></label>
        <label className="text-[13px] font-medium text-text-2">Title<Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required /></label>
        <label className="text-[13px] font-medium text-text-2">Invoice date<Input className="mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-[13px] font-medium text-text-2">Due date<Input className="mt-1" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-left text-xs text-text-3">
            {po ? <tr><th className="px-3 py-2">PO line</th><th className="px-3 py-2 text-right">Line total</th><th className="px-3 py-2 text-right">Billed to date</th><th className="px-3 py-2 text-right">Remaining</th><th className="px-3 py-2 text-right">This bill</th></tr>
              : <tr><th className="px-3 py-2">Description</th><th className="px-3 py-2">Cost code</th><th className="px-3 py-2 text-right">Amount</th><th className="w-8" /></tr>}
          </thead>
          <tbody className="divide-y divide-border">
            {po ? po.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">{l.title}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCAD(l.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCAD(l.billed)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCAD(l.total - l.billed)}</td>
                <td className="px-3 py-1 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAmounts({ ...amounts, [l.id]: String(Math.round((l.total - l.billed) * 100) / 100) })}>Rest</Button>
                    <Input aria-label={`Amount for ${l.title}`} type="number" step="0.01" className="h-8 w-32 text-right" value={amounts[l.id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [l.id]: e.target.value })} />
                  </div>
                </td>
              </tr>
            )) : free.map((l, i) => (
              <tr key={l.key}>
                <td className="px-2 py-1"><Input aria-label="Description" className="h-8" value={l.title} onChange={(e) => setFree(free.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} maxLength={200} /></td>
                <td className="px-2 py-1"><Select aria-label="Cost code" className="h-8 w-48" value={l.cost_code_id} onChange={(e) => setFree(free.map((x, j) => (j === i ? { ...x, cost_code_id: e.target.value } : x)))}><option value="">—</option>{codes.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}</Select></td>
                <td className="px-2 py-1"><Input aria-label="Amount" type="number" step="0.01" className="ml-auto h-8 w-32 text-right" value={l.amount} onChange={(e) => setFree(free.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} /></td>
                <td className="pr-2"><Button type="button" size="sm" variant="ghost" aria-label="Remove line" onClick={() => setFree(free.filter((_, j) => j !== i))}><Trash2 /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!po && <div className="border-t border-border p-2"><Button type="button" size="sm" onClick={() => setFree([...free, { key: String(Date.now()), title: '', cost_code_id: '', amount: '' }])}><Plus />Add line</Button></div>}
      </Card>

      <Card className="ml-auto w-full max-w-sm space-y-2 p-4 text-[13px]">
        <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCAD(subtotal)}</span></div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2"><Checkbox checked={gst && taxOverride == null} onChange={(e) => { setGst(e.target.checked); setTaxOverride(null) }} /> GST 5%</label>
          <Input aria-label="Tax" type="number" step="0.01" min="0" className="h-8 w-28 text-right" value={taxOverride ?? tax.toFixed(2)} onChange={(e) => setTaxOverride(e.target.value)} />
        </div>
        {!po && !isSub && (
          <div className="flex items-center justify-between"><span>Holdback %</span><Input aria-label="Holdback %" type="number" min="0" max="100" className="h-8 w-20 text-right" value={holdback} onChange={(e) => setHoldback(e.target.value)} /></div>
        )}
        <div className="flex justify-between text-text-3"><span>Holdback withheld ({po ? po.holdback_pct : Number(holdback) || 0}%)</span><span className="tabular-nums">−{formatCAD(hb)}</span></div>
        <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><span>Payable now</span><span className="tabular-nums" data-testid="bill-payable">{formatCAD(payable)}</span></div>
        {!isSub && <label className="flex items-center gap-2 pt-1"><Checkbox checked={lien} onChange={(e) => setLien(e.target.checked)} /> Require a lien waiver before paying</label>}
      </Card>
      <div className="flex justify-end"><Button variant="primary" disabled={pending || subtotal === 0 || !title.trim()} onClick={submit}>{pending ? 'Saving…' : isSub ? 'Submit bill' : 'Save bill'}</Button></div>
    </div>
  )
}
