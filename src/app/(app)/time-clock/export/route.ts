import { NextResponse, type NextRequest } from 'next/server'
import { getAppContext, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { todayIn, zonedToUtc } from '@/lib/utils'
import { addDays, mondayOf, OT_RULES, weekOvertime } from '@/lib/overtime'

const tz = 'America/Edmonton'
const localDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

/** Weekly hours per person (approved shifts) for payroll import. */
export async function GET(req: NextRequest) {
  const ctx = await getAppContext()
  if (ctx.workspace.mode !== 'builder' || !hasAction(ctx, 'time_clock.view_others')) return new NextResponse('Forbidden', { status: 403 })
  const week = mondayOf(req.nextUrl.searchParams.get('week') ?? todayIn())
  const supabase = await createClient()
  const [{ data: shifts }, { data: org }, { data: members }] = await Promise.all([
    supabase.from('time_shifts').select('user_id,clock_in,clock_out,break_minutes,status').gte('clock_in', zonedToUtc(`${week}T00:00`)).lt('clock_in', zonedToUtc(`${addDays(week, 7)}T00:00`)).eq('status', 'approved'),
    supabase.from('organizations').select('province').eq('id', ctx.workspace.orgId).single(),
    supabase.from('org_members').select('user_id,profiles(first_name,last_name,email)').eq('org_id', ctx.workspace.orgId),
  ])
  const rule = OT_RULES[(org?.province ?? 'AB').toUpperCase()] ?? OT_RULES.AB
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const rows = [['Last name', 'First name', 'Email', 'Pay period start', 'Pay period end', 'Regular hours', 'Overtime hours', 'Total hours']]
  for (const m of members ?? []) {
    const mine = (shifts ?? []).filter((s) => s.user_id === m.user_id)
    if (!mine.length) continue
    const perDay = days.map((d) => mine.filter((s) => localDate(s.clock_in) === d).reduce((t, s) => t + Math.max(0, (Date.parse(s.clock_out!) - Date.parse(s.clock_in)) / 3_600_000 - s.break_minutes / 60), 0))
    const t = weekOvertime(perDay, rule)
    const p = m.profiles as { first_name: string; last_name: string; email: string } | null
    rows.push([p?.last_name ?? '', p?.first_name ?? '', p?.email ?? '', week, addDays(week, 6), t.regular.toFixed(2), t.overtime.toFixed(2), t.total.toFixed(2)])
  }
  const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
  return new NextResponse(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="timesheets-${week}.csv"` } })
}
