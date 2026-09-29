import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { History } from 'lucide-react'
import { requireBuilder, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateTime, zonedToUtc } from '@/lib/utils'

export const metadata: Metadata = { title: 'Audit log' }

const TABLES: Record<string, { label: string; href?: (id: string) => string }> = {
  jobs: { label: 'Job', href: (id) => `/jobs/${id}` }, job_private: { label: 'Job price', href: (id) => `/jobs/${id}` },
  job_subs: { label: 'Job sub' }, job_clients: { label: 'Job client' }, todos: { label: 'To-do', href: (id) => `/todos/${id}` },
  daily_logs: { label: 'Daily log', href: (id) => `/daily-logs/${id}` }, rfis: { label: 'RFI', href: (id) => `/rfis/${id}` },
  leads: { label: 'Lead', href: (id) => `/leads/${id}` }, files: { label: 'File' }, comments: { label: 'Comment' },
  bills: { label: 'Bill', href: (id) => `/bills/${id}` }, purchase_orders: { label: 'Purchase order', href: (id) => `/purchase-orders/${id}` },
  client_invoices: { label: 'Invoice', href: (id) => `/invoices/${id}` }, client_payments: { label: 'Payment' },
  change_orders: { label: 'Change order', href: (id) => `/change-orders/${id}` }, selections: { label: 'Selection', href: (id) => `/selections/${id}` },
  proposals: { label: 'Proposal', href: (id) => `/proposals/${id}` }, time_shifts: { label: 'Time shift' }, sub_certificates: { label: 'Certificate' },
  builder_sub_links: { label: 'Sub / vendor', href: (id) => `/settings/subs/${id}` }, cost_codes: { label: 'Cost code' }, roles: { label: 'Role' },
  org_members: { label: 'User' }, organizations: { label: 'Company settings' },
}
const HIDE = new Set(['updated_at', 'created_at', 'org_id', 'id', 'search', 'snapshot'])
const show = (v: unknown) => { const s = v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 60 ? `${s.slice(0, 57)}…` : s }
const nameOf = (r: Record<string, unknown> | null) => r ? String(r.title ?? r.name ?? r.company_name ?? r.code ?? r.invoice_ref ?? '') : ''

export default async function AuditPage({ searchParams }: PageProps<'/settings/audit'>) {
  const sp = await searchParams
  const ctx = await requireBuilder()
  if (!hasAction(ctx, 'audit.view')) redirect('/settings/profile')
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')
  const table = one('table'), who = one('who'), from = one('from'), to = one('to')
  const page = Math.max(1, Number(one('page')) || 1)
  const supabase = await createClient()
  let q = supabase.from('audit_log').select('id,actor_id,table_name,record_id,action,before,after,at', { count: 'exact' })
    .eq('org_id', ctx.workspace.orgId).order('at', { ascending: false }).range((page - 1) * 100, page * 100 - 1)
  if (table in TABLES) q = q.eq('table_name', table)
  if (/^[0-9a-f-]{36}$/.test(who)) q = q.eq('actor_id', who)
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte('at', zonedToUtc(`${from}T00:00`, ctx.tz))
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lt('at', zonedToUtc(`${to}T23:59`, ctx.tz))
  const [{ data: rows, count }, { data: members }] = await Promise.all([
    q, supabase.from('org_members').select('user_id,profiles(first_name,last_name,email)').eq('org_id', ctx.workspace.orgId),
  ])
  const person = new Map((members ?? []).map((m) => { const p = m.profiles as { first_name: string; last_name: string; email: string } | null; return [m.user_id, p ? `${p.first_name} ${p.last_name}`.trim() || p.email : 'Someone'] }))
  const qs = (patch: Record<string, string>) => '?' + new URLSearchParams(Object.entries({ table, who, from, to, ...patch }).filter(([, v]) => v)).toString()

  return (
    <>
      <PageHeader title="Audit log" />
      <div className="space-y-4 p-5">
        <form className="flex flex-wrap items-end gap-2 text-[13px]">
          <label className="text-text-2">Record type<Select name="table" defaultValue={table} className="mt-1 w-44"><option value="">All</option>{Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></label>
          <label className="text-text-2">Who<Select name="who" defaultValue={who} className="mt-1 w-44"><option value="">Anyone</option>{[...person].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select></label>
          <label className="text-text-2">From<Input name="from" type="date" defaultValue={from} className="mt-1" /></label>
          <label className="text-text-2">To<Input name="to" type="date" defaultValue={to} className="mt-1" /></label>
          <Button type="submit">Filter</Button>
        </form>
        <Card className="overflow-x-auto">
          {(rows ?? []).length === 0 ? <EmptyState icon={History} title="Nothing logged" body="Changes to jobs, money, people and settings show up here." /> : (
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">What</th><th className="px-3 py-2">Changes</th></tr></thead>
              <tbody className="divide-y divide-border">
                {(rows ?? []).map((r) => {
                  const t = TABLES[r.table_name] ?? { label: r.table_name }
                  const before = r.before as Record<string, unknown> | null, after = r.after as Record<string, unknown> | null
                  const changed = r.action === 'update' && before && after
                    ? Object.keys(after).filter((k) => !HIDE.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k])) : []
                  const label = nameOf(after ?? before)
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-text-3">{formatDateTime(r.at, ctx.tz)}</td>
                      <td className="px-3 py-2">{r.actor_id ? person.get(r.actor_id) ?? 'Former user' : 'System'}</td>
                      <td className="px-3 py-2">
                        <Badge tone={r.action === 'delete' ? 'danger' : r.action === 'insert' ? 'success' : 'neutral'}>{r.action === 'insert' ? 'Added' : r.action === 'delete' ? 'Deleted' : 'Changed'}</Badge>{' '}
                        {t.label}{label ? ': ' : ''}{t.href && r.action !== 'delete' && label ? <Link href={t.href(r.record_id)} className="text-brand hover:underline">{label}</Link> : label}
                      </td>
                      <td className="px-3 py-2 text-xs text-text-2">
                        {changed.slice(0, 6).map((k) => <div key={k}><span className="text-text-3">{k.replace(/_/g, ' ')}:</span> {show(before?.[k])} → {show(after?.[k])}</div>)}
                        {changed.length > 6 && <div className="text-text-3">+{changed.length - 6} more</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
        {(count ?? 0) > 100 && (
          <div className="flex items-center gap-2 text-[13px]">
            {page > 1 && <Button asChild size="sm"><Link href={qs({ page: String(page - 1) })}>Newer</Link></Button>}
            <span className="text-text-3">Page {page} of {Math.ceil((count ?? 0) / 100)}</span>
            {page * 100 < (count ?? 0) && <Button asChild size="sm"><Link href={qs({ page: String(page + 1) })}>Older</Link></Button>}
          </div>
        )}
      </div>
    </>
  )
}
