import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Download, Trash2 } from 'lucide-react'
import { requireBuilder, can, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { costCodes } from '@/lib/financial'
import { PageHeader } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ActionForm } from '@/components/kit/action-form'
import { cn, formatCAD, todayIn, zonedToUtc } from '@/lib/utils'
import { addDays, mondayOf, OT_RULES, weekOvertime } from '@/lib/overtime'
import { Clock } from './clock'
import { addShift, deleteShift, reviewShifts, saveRates } from './actions'

export const metadata: Metadata = { title: 'Time clock' }

const STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger' | 'warning' }> = {
  open: { label: 'Clocked in', tone: 'brand' }, submitted: { label: 'Needs approval', tone: 'warning' }, approved: { label: 'Approved', tone: 'success' }, rejected: { label: 'Rejected', tone: 'danger' },
}
const tz = 'America/Edmonton'
const localDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const localTime = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '')
const dayLabel = (d: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${d}T12:00:00Z`))
const hours = (s: { clock_in: string; clock_out: string | null; break_minutes: number }) =>
  s.clock_out ? Math.max(0, Math.round(((Date.parse(s.clock_out) - Date.parse(s.clock_in)) / 3_600_000 - s.break_minutes / 60) * 100) / 100) : 0

type Shift = { id: string; user_id: string; job_id: string; cost_code_id: string | null; clock_in: string; clock_out: string | null; break_minutes: number; notes: string | null; status: string; hourly_cost: number | null; in_lat: number | null }

export default async function TimeClockPage({ searchParams }: PageProps<'/time-clock'>) {
  const sp = await searchParams
  const ctx = await requireBuilder('time_clock')
  const tab = sp.tab === 'team' || sp.tab === 'rates' ? sp.tab : 'mine'
  const week = mondayOf(typeof sp.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : todayIn())
  const from = zonedToUtc(`${week}T00:00`), to = zonedToUtc(`${addDays(week, 7)}T00:00`)
  const supabase = await createClient()
  const org = ctx.workspace.orgId
  const viewOthers = hasAction(ctx, 'time_clock.view_others')
  const canApprove = hasAction(ctx, 'time_clock.approve')
  const canRates = hasAction(ctx, 'settings.manage')
  const { data: orgRow } = await supabase.from('organizations').select('province').eq('id', org).single()
  const rule = OT_RULES[(orgRow?.province ?? 'AB').toUpperCase()] ?? OT_RULES.AB

  const [{ data: openShift }, codes, { data: members }] = await Promise.all([
    supabase.from('time_shifts').select('job_id,clock_in,cost_code_id').eq('user_id', ctx.userId).eq('status', 'open').maybeSingle(),
    costCodes(org),
    supabase.from('org_members').select('user_id,profiles(first_name,last_name,email)').eq('org_id', org).eq('status', 'active'),
  ])
  let q = supabase.from('time_shifts').select('id,user_id,job_id,cost_code_id,clock_in,clock_out,break_minutes,notes,status,hourly_cost,in_lat').gte('clock_in', from).lt('clock_in', to).order('clock_in')
  if (tab === 'mine') q = q.eq('user_id', ctx.userId)
  const { data: shifts } = tab === 'rates' ? { data: [] } : await q
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  const codeName = new Map(codes.map((c) => [c.id, `${c.code} ${c.title}`]))
  type P = { first_name: string; last_name: string; email: string } | null
  const person = new Map((members ?? []).map((m) => { const p = m.profiles as P; return [m.user_id, p ? `${p.first_name} ${p.last_name}`.trim() || p.email : 'Someone'] }))
  const byUser = new Map<string, Shift[]>()
  for (const s of (shifts ?? []) as Shift[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const summary = (list: Shift[]) => weekOvertime(days.map((d) => list.filter((s) => localDate(s.clock_in) === d && s.status !== 'rejected').reduce((t, s) => t + hours(s), 0)), rule)
  const { data: rates } = tab === 'rates' ? await supabase.from('labor_rates').select('user_id,hourly_cost').eq('org_id', org) : { data: [] }
  const rate = new Map((rates ?? []).map((r) => [r.user_id, Number(r.hourly_cost)]))

  const nav = (
    <nav className="mt-3 flex flex-wrap items-center gap-4 text-[13px]">
      {[['mine', 'My time'], ...(viewOthers ? [['team', 'Team timesheets']] : []), ...(canRates ? [['rates', 'Labour rates']] : [])].map(([k, l]) => (
        <Link key={k} href={`/time-clock?tab=${k}&week=${week}`} className={cn('-mb-3 border-b-2 pb-2', tab === k ? 'border-brand font-medium text-brand' : 'border-transparent text-text-2')}>{l}</Link>
      ))}
    </nav>
  )
  const weekNav = (
    <div className="flex items-center gap-2 text-[13px]">
      <Button asChild size="sm" variant="ghost" aria-label="Previous week"><Link href={`/time-clock?tab=${tab}&week=${addDays(week, -7)}`}><ChevronLeft /></Link></Button>
      <span className="font-medium">Week of {dayLabel(week)}</span>
      <Button asChild size="sm" variant="ghost" aria-label="Next week"><Link href={`/time-clock?tab=${tab}&week=${addDays(week, 7)}`}><ChevronRight /></Link></Button>
      {tab === 'team' && <Button asChild size="sm" className="ml-2"><a href={`/time-clock/export?week=${week}`}><Download />Export for payroll (CSV)</a></Button>}
    </div>
  )
  const table = (list: Shift[], selectable: boolean, showPerson: boolean) => (
    <table className="w-full text-[13px]">
      <thead className="bg-surface-2 text-left text-xs text-text-3"><tr>{selectable && <th className="w-8 px-3 py-2" />}{showPerson && <th className="px-3 py-2">Person</th>}<th className="px-3 py-2">Day</th><th className="px-3 py-2">Job</th><th className="px-3 py-2">Cost code</th><th className="px-3 py-2">In</th><th className="px-3 py-2">Out</th><th className="px-3 py-2 text-right">Break</th><th className="px-3 py-2 text-right">Hours</th><th className="px-3 py-2">Status</th><th className="w-8" /></tr></thead>
      <tbody className="divide-y divide-border">
        {list.map((s) => (
          <tr key={s.id}>
            {selectable && <td className="px-3 py-2">{s.status === 'submitted' && s.user_id !== ctx.userId && <Checkbox name="shift" value={s.id} aria-label={`Select shift ${person.get(s.user_id)} ${localDate(s.clock_in)}`} />}</td>}
            {showPerson && <td className="px-3 py-2">{person.get(s.user_id)}</td>}
            <td className="px-3 py-2">{dayLabel(localDate(s.clock_in))}</td>
            <td className="px-3 py-2">{jobName.get(s.job_id)}{s.in_lat != null && <span title="Location recorded" className="ml-1 text-text-3">📍</span>}</td>
            <td className="px-3 py-2 text-text-3">{s.cost_code_id ? codeName.get(s.cost_code_id) : ''}</td>
            <td className="px-3 py-2">{localTime(s.clock_in)}</td>
            <td className="px-3 py-2">{localTime(s.clock_out)}</td>
            <td className="px-3 py-2 text-right">{s.break_minutes ? `${s.break_minutes}m` : ''}</td>
            <td className="px-3 py-2 text-right tabular-nums">{s.clock_out ? hours(s).toFixed(2) : ''}</td>
            <td className="px-3 py-2"><Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge></td>
            <td className="pr-2">{s.user_id === ctx.userId && ['submitted', 'rejected'].includes(s.status) && <form action={deleteShift.bind(null, s.id)}><Button type="submit" size="icon" variant="ghost" aria-label="Delete shift"><Trash2 /></Button></form>}</td>
          </tr>
        ))}
        {list.length === 0 && <tr><td colSpan={11} className="px-3 py-3 text-text-3">No shifts this week.</td></tr>}
      </tbody>
    </table>
  )

  return (
    <>
      <PageHeader title="Time clock">{nav}</PageHeader>
      <div className="space-y-4 p-5">
        {tab === 'mine' && (
          <>
            {can(ctx, 'time_clock', 'add') && <Clock open={openShift ? { job: openShift.job_id, since: openShift.clock_in, costCode: openShift.cost_code_id } : null}
              jobs={ctx.jobs.map(({ id, title }) => ({ id, title }))} codes={codes} defaultJob={ctx.selection.jobIds.length === 1 ? ctx.selection.jobIds[0] : ''} />}
            {weekNav}
            <Card className="overflow-x-auto">
              {table((shifts ?? []) as Shift[], false, false)}
              {(() => { const t = summary((shifts ?? []) as Shift[]); return <div className="flex justify-end gap-6 border-t border-border px-4 py-2 text-[13px]"><span>Regular <b className="tabular-nums" data-testid="regular-hours">{t.regular.toFixed(2)}</b></span><span>Overtime <b className="tabular-nums" data-testid="ot-hours">{t.overtime.toFixed(2)}</b></span><span>Total <b className="tabular-nums">{t.total.toFixed(2)}</b></span></div> })()}
            </Card>
            {can(ctx, 'time_clock', 'add') && (
              <Card>
                <CardHeader title="Forgot to clock in?" description="Add a shift by hand. It goes to your manager for approval." />
                <ActionForm action={addShift} className="grid gap-3 p-4 sm:grid-cols-4">
                  <label className="text-[13px] font-medium text-text-2 sm:col-span-2">Job<Select name="job" className="mt-1" required defaultValue=""><option value="" disabled>Pick a job</option>{ctx.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</Select></label>
                  <label className="text-[13px] font-medium text-text-2 sm:col-span-2">Cost code<Select name="cost_code" className="mt-1" defaultValue=""><option value="">—</option>{codes.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}</Select></label>
                  <label className="text-[13px] font-medium text-text-2">Date<Input name="date" type="date" className="mt-1" defaultValue={todayIn()} required /></label>
                  <label className="text-[13px] font-medium text-text-2">Start<Input name="start" type="time" className="mt-1" defaultValue="07:00" required /></label>
                  <label className="text-[13px] font-medium text-text-2">End<Input name="end" type="time" className="mt-1" defaultValue="15:30" required /></label>
                  <label className="text-[13px] font-medium text-text-2">Break (min)<Input name="break_minutes" type="number" min="0" max="720" className="mt-1" defaultValue="30" /></label>
                  <label className="text-[13px] font-medium text-text-2 sm:col-span-3">Notes<Input name="notes" className="mt-1" maxLength={2000} /></label>
                  <div className="self-end"><Button type="submit">Add shift</Button></div>
                </ActionForm>
              </Card>
            )}
          </>
        )}

        {tab === 'team' && viewOthers && (
          <>
            {weekNav}
            {[...byUser.entries()].length === 0 && <p className="text-[13px] text-text-3">No shifts this week.</p>}
            <form className="space-y-4">
              {[...byUser.entries()].map(([uid, list]) => {
                const t = summary(list)
                return (
                  <Card key={uid} className="overflow-x-auto">
                    <div className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-2 text-[13px]">
                      <span className="font-medium">{person.get(uid)}</span>
                      <span className="text-text-3">Regular {t.regular.toFixed(2)} · Overtime {t.overtime.toFixed(2)} · Total {t.total.toFixed(2)}</span>
                    </div>
                    {table(list, canApprove, false)}
                  </Card>
                )
              })}
              {canApprove && byUser.size > 0 && (
                <div className="flex gap-2">
                  <Button formAction={reviewShifts.bind(null, true)} variant="primary">Approve selected</Button>
                  <Button formAction={reviewShifts.bind(null, false)}>Reject selected</Button>
                </div>
              )}
            </form>
            <p className="text-xs text-text-3">Overtime follows {orgRow?.province ?? 'AB'} rules (daily {rule.daily ?? '—'} h, weekly {rule.weekly ?? '—'} h). Approved shifts post labour cost to the job budget at each person’s rate.</p>
          </>
        )}

        {tab === 'rates' && canRates && (
          <Card>
            <CardHeader title="Labour rates" description="Hourly cost per person (wage plus burden). Used for job costing when shifts are approved. Only admins see these." />
            <form action={saveRates} className="space-y-2 p-4">
              {(members ?? []).map((m) => (
                <label key={m.user_id} className="flex items-center gap-3 text-[13px]">
                  <span className="w-56">{person.get(m.user_id)}</span>
                  <Input name={`rate:${m.user_id}`} type="number" step="0.01" min="0" className="w-32 text-right" defaultValue={rate.get(m.user_id) ?? ''} aria-label={`Hourly cost for ${person.get(m.user_id)}`} />
                  <span className="text-text-3">{rate.has(m.user_id) ? `${formatCAD(rate.get(m.user_id))}/h` : 'not set'}</span>
                </label>
              ))}
              <Button type="submit" variant="primary">Save rates</Button>
            </form>
          </Card>
        )}
      </div>
    </>
  )
}
