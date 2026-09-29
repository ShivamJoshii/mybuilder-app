// Overtime by provincial rule. Default Alberta: over 8 h in a day or 44 h in a week,
// whichever gives more overtime (daily OT first, then weekly on the remaining regular hours).
export type OtRule = { daily: number | null; weekly: number | null }
export const OT_RULES: Record<string, OtRule> = {
  AB: { daily: 8, weekly: 44 }, BC: { daily: 8, weekly: 40 }, SK: { daily: 8, weekly: 40 }, MB: { daily: 8, weekly: 40 },
  ON: { daily: null, weekly: 44 }, QC: { daily: null, weekly: 40 }, NB: { daily: null, weekly: 44 }, NS: { daily: null, weekly: 48 },
  PE: { daily: null, weekly: 48 }, NL: { daily: null, weekly: 40 }, YT: { daily: 8, weekly: 40 }, NT: { daily: 8, weekly: 40 }, NU: { daily: 8, weekly: 40 },
}

/** hoursByDay: hours worked per calendar day within one week. */
export function weekOvertime(hoursByDay: number[], rule: OtRule = OT_RULES.AB) {
  const total = hoursByDay.reduce((s, h) => s + h, 0)
  const daily = rule.daily == null ? 0 : hoursByDay.reduce((s, h) => s + Math.max(0, h - rule.daily!), 0)
  const weekly = rule.weekly == null ? 0 : Math.max(0, total - daily - rule.weekly)
  const overtime = Math.round((daily + weekly) * 100) / 100
  return { total: Math.round(total * 100) / 100, regular: Math.round((total - overtime) * 100) / 100, overtime }
}

/** Monday (YYYY-MM-DD) of the week containing a date. */
export function mondayOf(date: string) {
  const d = new Date(`${date}T12:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}
export const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
