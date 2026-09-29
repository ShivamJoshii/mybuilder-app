import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCAD, formatDate } from '@/lib/utils'

type Fin = {
  summary?: { contract: number; changes: number; revised: number; invoiced: number; paid: number; balance: number }
  budget?: { code: string | null; title: string; budget: number; actual: number }[]
  costs?: { kind: string; ref: string; title: string; vendor: string | null; date: string; amount: number; status: string }[]
}

/** The money a builder chose to show this client (price summary, open-book budget, costs). */
export async function ClientMoney({ jobId }: { jobId: string }) {
  const supabase = await createClient()
  const { data } = await supabase.rpc('client_job_financials', { p_job: jobId })
  const f = (data ?? {}) as Fin
  if (!f.summary && !f.budget && !f.costs) return null
  return (
    <>
      {f.summary && (
        <Card>
          <CardHeader title="Your contract" />
          <dl className="grid grid-cols-2 gap-3 p-4 text-[13px] sm:grid-cols-3">
            {([['Original contract', f.summary.contract], ['Approved changes', f.summary.changes], ['Current contract', f.summary.revised],
              ['Invoiced', f.summary.invoiced], ['Paid', f.summary.paid], ['Left to pay', f.summary.balance]] as const).map(([l, v]) => (
              <div key={l}><dt className="text-xs text-text-3">{l}</dt><dd className="text-base font-semibold tabular-nums">{formatCAD(Number(v))}</dd></div>
            ))}
          </dl>
        </Card>
      )}
      {f.budget && f.budget.length > 0 && (
        <Card className="overflow-x-auto">
          <CardHeader title="Budget and costs to date" />
          <table className="w-full min-w-[480px] text-[13px]">
            <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="px-3 py-2">Cost code</th><th className="px-3 py-2 text-right">Budget</th><th className="px-3 py-2 text-right">Spent</th><th className="px-3 py-2 text-right">Remaining</th></tr></thead>
            <tbody className="divide-y divide-border">
              {f.budget.map((b, i) => (
                <tr key={i}><td className="px-3 py-2">{b.code ? `${b.code} ` : ''}{b.title}</td><td className="px-3 py-2 text-right tabular-nums">{formatCAD(Number(b.budget))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCAD(Number(b.actual))}</td><td className="px-3 py-2 text-right tabular-nums">{formatCAD(Number(b.budget) - Number(b.actual))}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {f.costs && f.costs.length > 0 && (
        <Card className="overflow-x-auto">
          <CardHeader title="Purchase orders and bills" />
          <table className="w-full min-w-[560px] text-[13px]">
            <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">What</th><th className="px-3 py-2">From</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-border">
              {f.costs.map((c, i) => (
                <tr key={i}><td className="px-3 py-2 text-text-3">{formatDate(c.date)}</td><td className="px-3 py-2">{c.ref} · {c.title} <Badge>{c.kind}</Badge></td>
                  <td className="px-3 py-2">{c.vendor}</td><td className="px-3 py-2 text-right tabular-nums">{formatCAD(Number(c.amount))}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
