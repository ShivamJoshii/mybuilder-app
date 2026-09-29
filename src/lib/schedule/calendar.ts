/**
 * Workday calendar + dependency scheduling. Pure functions, no I/O.
 * Dates are ISO strings (YYYY-MM-DD) and treated as calendar days (no time zone).
 */

export type Exception = {
  type: 'non_workday' | 'extra_workday'
  start_date: string
  end_date: string
  repeat_annually: boolean
}

export type Calendar = {
  workDays: number[]      // 0 = Sunday … 6 = Saturday
  exceptions: Exception[]
}

const DAY = 86_400_000

export function parse(d: string): number {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}
export function fmt(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}
export function addDays(d: string, n: number): string {
  return fmt(parse(d) + n * DAY)
}
export function weekday(d: string): number {
  return new Date(parse(d)).getUTCDay()
}

function inRange(d: string, e: Exception): boolean {
  if (!e.repeat_annually) return d >= e.start_date && d <= e.end_date
  // compare month-day only; handles ranges that wrap the year end
  const md = d.slice(5)
  const s = e.start_date.slice(5)
  const t = e.end_date.slice(5)
  return s <= t ? md >= s && md <= t : md >= s || md <= t
}

export function isWorkday(d: string, cal: Calendar): boolean {
  // extra workdays win over non-workdays when both apply
  if (cal.exceptions.some((e) => e.type === 'extra_workday' && inRange(d, e))) return true
  if (cal.exceptions.some((e) => e.type === 'non_workday' && inRange(d, e))) return false
  return cal.workDays.includes(weekday(d))
}

/** First workday on or after d. */
export function nextWorkday(d: string, cal: Calendar): string {
  let cur = d
  for (let i = 0; i < 3660 && !isWorkday(cur, cal); i++) cur = addDays(cur, 1)
  return cur
}

/** Workday n steps from d (n may be negative). addWorkdays(d, 0) = nextWorkday(d). */
export function addWorkdays(d: string, n: number, cal: Calendar): string {
  let cur = nextWorkday(d, cal)
  const step = n >= 0 ? 1 : -1
  let left = Math.abs(n)
  let guard = 0
  while (left > 0 && guard++ < 36600) {
    cur = addDays(cur, step)
    if (isWorkday(cur, cal)) left--
  }
  return cur
}

/** End date for an item that starts on `start` and lasts `duration` workdays (>= 1). */
export function endFor(start: string, duration: number, cal: Calendar): string {
  return addWorkdays(start, Math.max(1, duration) - 1, cal)
}

/** Number of workdays from a to b inclusive (0 if b < a). */
export function workdaysBetween(a: string, b: string, cal: Calendar): number {
  if (b < a) return 0
  let n = 0
  for (let cur = a, i = 0; cur <= b && i < 36600; cur = addDays(cur, 1), i++) if (isWorkday(cur, cal)) n++
  return n
}

export type Item = { id: string; start_date: string; duration: number; end_date: string }
export type Link = { predecessor_id: string; successor_id: string; type: 'FS' | 'SS'; lag_days: number }

/** Earliest start allowed by one link. */
export function constraintStart(pred: Item, link: Link, cal: Calendar): string {
  if (link.type === 'SS') return addWorkdays(pred.start_date, link.lag_days, cal)
  // Finish-to-start: day after the predecessor ends, then lag
  return addWorkdays(addWorkdays(pred.end_date, 1, cal), link.lag_days, cal)
}

export class CycleError extends Error {}

/**
 * Re-schedule every item that depends (directly or indirectly) on the changed items.
 * A successor starts on the latest date its predecessors allow. Items without
 * predecessors keep their dates. Returns only items whose dates changed.
 */
export function cascade(items: Item[], links: Link[], cal: Calendar, changedIds?: string[]): Item[] {
  const byId = new Map(items.map((i) => [i.id, { ...i }]))
  const preds = new Map<string, Link[]>()
  const succs = new Map<string, string[]>()
  for (const l of links) {
    if (!byId.has(l.predecessor_id) || !byId.has(l.successor_id)) continue
    preds.set(l.successor_id, [...(preds.get(l.successor_id) ?? []), l])
    succs.set(l.predecessor_id, [...(succs.get(l.predecessor_id) ?? []), l.successor_id])
  }

  // Topological order (Kahn); a cycle is an error
  const indeg = new Map<string, number>([...byId.keys()].map((k) => [k, preds.get(k)?.length ?? 0]))
  const queue = [...byId.keys()].filter((k) => indeg.get(k) === 0)
  const order: string[] = []
  while (queue.length) {
    const k = queue.shift()!
    order.push(k)
    for (const s of succs.get(k) ?? []) {
      indeg.set(s, indeg.get(s)! - 1)
      if (indeg.get(s) === 0) queue.push(s)
    }
  }
  if (order.length !== byId.size) throw new CycleError('These links would create a loop')

  // Which items may move: everything downstream of the changed items (or all, when not given)
  let affected: Set<string> | null = null
  if (changedIds) {
    affected = new Set()
    const stack = [...changedIds]
    while (stack.length) {
      const k = stack.pop()!
      for (const s of succs.get(k) ?? []) if (!affected.has(s)) { affected.add(s); stack.push(s) }
    }
  }

  const changed: Item[] = []
  for (const id of order) {
    const ps = preds.get(id)
    if (!ps?.length || (affected && !affected.has(id))) continue
    const item = byId.get(id)!
    const start = ps.map((l) => constraintStart(byId.get(l.predecessor_id)!, l, cal)).sort().at(-1)!
    const end = endFor(start, item.duration, cal)
    if (start !== item.start_date || end !== item.end_date) {
      item.start_date = start
      item.end_date = end
      changed.push({ ...item })
    }
  }
  return changed
}

/** Would adding this link create a loop? */
export function createsCycle(links: Link[], add: Link): boolean {
  if (add.predecessor_id === add.successor_id) return true
  const succs = new Map<string, string[]>()
  for (const l of [...links, add]) succs.set(l.predecessor_id, [...(succs.get(l.predecessor_id) ?? []), l.successor_id])
  const seen = new Set<string>()
  const stack = [add.successor_id]
  while (stack.length) {
    const k = stack.pop()!
    if (k === add.predecessor_id) return true
    if (seen.has(k)) continue
    seen.add(k)
    stack.push(...(succs.get(k) ?? []))
  }
  return false
}

/** Critical path: items with zero total float, computed on workdays. */
export function criticalPath(items: Item[], links: Link[], cal: Calendar): Set<string> {
  if (items.length === 0) return new Set()
  const byId = new Map(items.map((i) => [i.id, i]))
  const finish = items.map((i) => i.end_date).sort().at(-1)!
  // Late finish via backward pass over successors
  const succLinks = new Map<string, Link[]>()
  for (const l of links) if (byId.has(l.predecessor_id) && byId.has(l.successor_id)) succLinks.set(l.predecessor_id, [...(succLinks.get(l.predecessor_id) ?? []), l])
  const lateStart = new Map<string, string>()
  const memo = (id: string, depth = 0): string => {
    if (lateStart.has(id)) return lateStart.get(id)!
    const item = byId.get(id)!
    const ls = succLinks.get(id)
    let lateFinish = finish
    if (ls?.length && depth < 5000) {
      lateFinish = ls.map((l) => {
        const s = memo(l.successor_id, depth + 1)
        return l.type === 'SS'
          ? endFor(addWorkdays(s, -l.lag_days, cal), item.duration, cal)
          : addWorkdays(addWorkdays(s, -l.lag_days, cal), -1, cal)
      }).sort()[0]
    }
    const v = addWorkdays(lateFinish, -(Math.max(1, item.duration) - 1), cal)
    lateStart.set(id, v)
    return v
  }
  const out = new Set<string>()
  for (const i of items) if (memo(i.id) <= i.start_date) out.add(i.id)
  return out
}
