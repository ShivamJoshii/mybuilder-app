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
