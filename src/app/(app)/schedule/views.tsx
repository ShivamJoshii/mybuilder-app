'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type ViewItem = {
  id: string; title: string; job_id: string; job_title: string; color: string; start_date: string; end_date: string
  duration: number; progress: number; completed: boolean; assignees: { label: string; status: string }[]
  critical: boolean; baseline_start: string | null; baseline_end: string | null; phase: string | null
}
export type ViewLink = { from: string; to: string; type: 'FS' | 'SS' }

const DAY = 86_400_000
const t = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) }
const iso = (n: number) => new Date(n).toISOString().slice(0, 10)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function statusOf(i: ViewItem, today: string) {
  if (i.completed) return 'Completed'
  if (i.end_date < today) return 'Past due'
  if (i.start_date <= today) return 'In progress'
  return 'Upcoming'
}

export function ListView({ items, today }: { items: ViewItem[]; today: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-[13px]">
        <thead className="bg-surface-2 text-left text-xs font-semibold text-text-2">
          <tr><th className="px-3 py-2">Title</th><th className="px-3 py-2">Job</th><th className="px-3 py-2">Start</th><th className="px-3 py-2">End</th><th className="px-3 py-2">Days</th><th className="px-3 py-2">Assigned</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Progress</th></tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const st = statusOf(i, today)
            return (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-2"><Link href={`/schedule/${i.id}`} className="flex items-center gap-2 font-medium text-brand hover:underline"><span className="size-2.5 rounded-full" style={{ background: i.color }} />{i.title}</Link></td>
                <td className="px-3 py-2 text-text-2">{i.job_title}</td>
                <td className="whitespace-nowrap px-3 py-2">{i.start_date}</td>
                <td className="whitespace-nowrap px-3 py-2">{i.end_date}</td>
                <td className="px-3 py-2">{i.duration}</td>
                <td className="px-3 py-2">{i.assignees.map((a) => a.label).join(', ')}</td>
                <td className="px-3 py-2"><Badge tone={st === 'Completed' ? 'success' : st === 'Past due' ? 'danger' : st === 'In progress' ? 'brand' : 'neutral'}>{st}</Badge></td>
                <td className="px-3 py-2">{i.progress}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function CalendarView({ items, today }: { items: ViewItem[]; today: string }) {
  const [month, setMonth] = useState(() => {
    // Start on this month, or on the first month that has work when this month is empty
    const cur = today.slice(0, 7)
    if (items.some((i) => i.start_date.slice(0, 7) <= cur && i.end_date.slice(0, 7) >= cur)) return cur
    return items.map((i) => i.start_date.slice(0, 7)).filter((m) => m >= cur).sort()[0] ?? cur
  })
  const [y, m] = month.split('-').map(Number)
  const first = Date.UTC(y, m - 1, 1)
  const gridStart = first - new Date(first).getUTCDay() * DAY
  const days = Array.from({ length: 42 }, (_, k) => iso(gridStart + k * DAY))
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(iso(d.getTime()).slice(0, 7)) }
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></Button>
        <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => shift(1)}><ChevronRight /></Button>
        <h2 className="font-semibold">{MONTHS[m - 1]} {y}</h2>
        <Button size="sm" className="ml-auto" onClick={() => setMonth(today.slice(0, 7))}>Today</Button>
      </div>
      <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-xs font-semibold text-text-3">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const on = items.filter((i) => i.start_date <= d && i.end_date >= d)
          return (
            <div key={d} className={cn('min-h-24 border-b border-r border-border p-1', d.slice(0, 7) !== month && 'bg-surface-2/60 text-text-3')}>
              <div className={cn('mb-1 text-right text-xs', d === today && 'font-semibold text-brand')}>{Number(d.slice(8))}</div>
              <div className="space-y-0.5">
                {on.slice(0, 4).map((i) => (
                  <Link key={i.id} href={`/schedule/${i.id}`} title={`${i.title} · ${i.job_title}`}
                    className={cn('block truncate rounded px-1 py-px text-[11px] text-white', i.completed && 'opacity-60 line-through')}
                    style={{ background: i.color }}>
                    {i.start_date === d || d.endsWith('-01') || new Date(t(d)).getUTCDay() === 0 ? i.title : ' '}
                  </Link>
                ))}
                {on.length > 4 && <div className="text-[11px] text-text-3">+{on.length - 4} more</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function GanttView({ items, links, today, showBaseline }: { items: ViewItem[]; links: ViewLink[]; today: string; showBaseline: boolean }) {
  const rows = items
  const { start, days } = useMemo(() => {
    if (rows.length === 0) return { start: t(today), days: 30 }
    const s = Math.min(...rows.map((r) => t(r.start_date)), ...rows.flatMap((r) => (r.baseline_start ? [t(r.baseline_start)] : [])))
    const e = Math.max(...rows.map((r) => t(r.end_date)), ...rows.flatMap((r) => (r.baseline_end ? [t(r.baseline_end)] : [])))
    const pad = 2 * DAY
    return { start: s - pad, days: Math.round((e - s + 2 * pad) / DAY) + 1 }
  }, [rows, today])
  const W = 28, H = 34, LEFT = 260
  const x = (d: string) => ((t(d) - start) / DAY) * W
  const idx = new Map(rows.map((r, k) => [r.id, k]))
  const todayX = x(today)

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div className="relative" style={{ width: LEFT + days * W, height: 40 + rows.length * H }}>
        {/* header */}
        <div className="sticky left-0 z-20 flex h-10 items-end border-b border-border bg-surface-2 px-3 pb-2 text-xs font-semibold text-text-2" style={{ width: LEFT, position: 'absolute' }}>Item</div>
        {Array.from({ length: days }, (_, k) => {
          const d = iso(start + k * DAY)
          const wd = new Date(start + k * DAY).getUTCDay()
          return (
            <div key={d} className={cn('absolute top-0 border-l border-border text-center text-[10px] text-text-3', (wd === 0 || wd === 6) && 'bg-surface-2')}
              style={{ left: LEFT + k * W, width: W, height: 40 + rows.length * H }}>
              <div className="h-10 border-b border-border pt-1 leading-tight">
                {(k === 0 || d.endsWith('-01')) && <div className="font-semibold">{MONTHS[Number(d.slice(5, 7)) - 1]}</div>}
                <div>{Number(d.slice(8))}</div>
              </div>
            </div>
          )
        })}
        {todayX >= 0 && <div className="absolute top-10 z-10 w-px bg-danger" style={{ left: LEFT + todayX + W / 2, height: rows.length * H }} aria-hidden />}
        {/* rows */}
        {rows.map((r, k) => {
          const top = 40 + k * H
          const left = LEFT + x(r.start_date)
          const width = (t(r.end_date) - t(r.start_date)) / DAY * W + W
          return (
            <div key={r.id}>
              <Link href={`/schedule/${r.id}`} className="absolute z-20 flex items-center gap-2 truncate border-b border-r border-border bg-surface px-3 text-[13px] hover:text-brand"
                style={{ top, height: H, width: LEFT, left: 0 }}>
                <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="truncate">{r.title}</span>
              </Link>
              {showBaseline && r.baseline_start && r.baseline_end && (
                <div className="absolute rounded-sm border border-dashed border-text-3/60" title={`Baseline ${r.baseline_start} – ${r.baseline_end}`}
                  style={{ top: top + 22, height: 6, left: LEFT + x(r.baseline_start), width: (t(r.baseline_end) - t(r.baseline_start)) / DAY * W + W }} />
              )}
              <Link href={`/schedule/${r.id}`} title={`${r.title}: ${r.start_date} – ${r.end_date}${r.critical ? ' (critical path)' : ''}`}
                className={cn('absolute z-10 overflow-hidden rounded text-[11px] leading-5 text-white', r.critical && 'ring-2 ring-danger/70')}
                style={{ top: top + 6, height: 20, left, width, background: r.critical ? '#2563eb' : r.color }}>
                <span className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${r.progress}%` }} />
                <span className="relative px-1.5">{r.duration}d</span>
              </Link>
            </div>
          )
        })}
        {/* dependency lines */}
        <svg className="pointer-events-none absolute left-0 top-0 z-10" width={LEFT + days * W} height={40 + rows.length * H} aria-hidden>
          <defs><marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#94a3b8" /></marker></defs>
          {links.map((l) => {
            const a = idx.get(l.from), b = idx.get(l.to)
            if (a == null || b == null) return null
            const from = rows[a], to = rows[b]
            const x1 = LEFT + (l.type === 'SS' ? x(from.start_date) : x(from.end_date) + W)
            const y1 = 40 + a * H + 16
            const x2 = LEFT + x(to.start_date)
            const y2 = 40 + b * H + 16
            const mid = Math.max(x1 + 6, Math.min(x2 - 6, x1 + 10))
            return <path key={`${l.from}-${l.to}`} d={`M${x1} ${y1}H${mid}V${y2}H${x2}`} fill="none" stroke="#94a3b8" strokeWidth="1.25" markerEnd="url(#dep-arrow)" />
          })}
        </svg>
      </div>
    </div>
  )
}
