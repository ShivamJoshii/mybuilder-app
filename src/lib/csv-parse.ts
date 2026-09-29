/** RFC 4180-ish CSV parser: quoted fields, escaped quotes, CRLF/LF, BOM. Returns rows of strings. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
    } else if (c === '"' && cell === '') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

/** Lower-case, strip punctuation: "Job Name" / "job_name" / "JOB-NAME" → "job name". */
export const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Dates as YYYY-MM-DD from ISO or North American M/D/YYYY (Buildertrend exports). */
export function parseDate(v: string): string | null | undefined {
  const t = v.trim()
  if (!t) return null
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t)
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` }
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10)
}

export const parseMoney = (v: string): number | null | undefined => {
  const t = v.trim().replace(/[$,\s]/g, '')
  if (!t) return null
  const n = Number(t.replace(/^\((.*)\)$/, '-$1'))
  return Number.isFinite(n) ? n : undefined
}

export const parseBool = (v: string) => /^(y|yes|true|1|x)$/i.test(v.trim())
