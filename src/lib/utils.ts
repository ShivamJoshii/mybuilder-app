import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fullName(p: { first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined) {
  if (!p) return ''
  const n = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  return n || p.email || ''
}

export function initials(p: { first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined) {
  if (!p) return '?'
  const a = (p.first_name ?? '').trim()[0] ?? ''
  const b = (p.last_name ?? '').trim()[0] ?? ''
  return (a + b).toUpperCase() || (p.email ?? '?')[0].toUpperCase()
}

export const PROVINCES = [
  ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'],
  ['NL', 'Newfoundland and Labrador'], ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'],
  ['NU', 'Nunavut'], ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Quebec'],
  ['SK', 'Saskatchewan'], ['YT', 'Yukon'],
] as const

export const JOB_STATUSES = [
  { value: 'presale', label: 'Presale' },
  { value: 'open', label: 'Open' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'closed', label: 'Closed' },
] as const

export function formatCAD(n: number | null | undefined) {
  if (n == null) return ''
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n)
}

export function formatDate(d: string | null | undefined) {
  if (!d) return ''
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** ISO date (YYYY-MM-DD) n days from now. */
export function isoDaysFromNow(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
}

/** Today's date (YYYY-MM-DD) in a time zone (defaults to Alberta). */
export function todayIn(tz = 'America/Edmonton') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** "YYYY-MM-DDTHH:mm" wall time in a zone → UTC ISO string (handles DST). */
export function zonedToUtc(local: string, tz = 'America/Edmonton') {
  const guess = new Date(`${local}:00Z`)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(guess).map((p) => [p.type, p.value]))
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  return new Date(guess.getTime() - (shown - guess.getTime())).toISOString()
}

/** UTC ISO → "YYYY-MM-DDTHH:mm" wall time in a zone (for datetime-local inputs). */
export function utcToZonedInput(iso: string | null | undefined, tz = 'America/Edmonton') {
  if (!iso) return ''
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

export function formatDateTime(iso: string | null | undefined, tz = 'America/Edmonton') {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

const TZ_NAMES: Record<string, string> = {
  'America/Vancouver': 'Pacific time', 'America/Edmonton': 'Mountain time', 'America/Regina': 'Saskatchewan time', 'America/Winnipeg': 'Central time',
  'America/Toronto': 'Eastern time', 'America/Halifax': 'Atlantic time', 'America/St_Johns': 'Newfoundland time',
}
/** "Mountain time" etc. for form hints. */
export const tzLabel = (tz: string) => TZ_NAMES[tz] ?? tz.replace(/^.*\//, '').replace(/_/g, ' ') + ' time'
