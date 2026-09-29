/** Modules whose records carry custom field values (mirrors private.cf_record in the database). */
export const CUSTOM_FIELD_MODULES = ['jobs', 'leads', 'daily_logs', 'todos', 'rfis', 'warranties'] as const
export type CustomFieldModule = (typeof CUSTOM_FIELD_MODULES)[number]

export type FieldDef = {
  id: string; label: string; data_type: string; options: unknown; tooltip: string | null; is_required: boolean
  visible_to_subs: boolean; visible_to_clients: boolean
}

export const opts = (d: FieldDef) => (Array.isArray(d.options) ? (d.options as unknown[]).map(String) : [])

/** Read one field from a form. undefined = empty (clears the value); throws on bad input. */
export function readField(d: FieldDef, fd: FormData): unknown {
  const name = `cf_${d.id}`
  const raw = String(fd.get(name) ?? '').trim()
  switch (d.data_type) {
    case 'boolean': return fd.get(name) === 'on'
    case 'multi_select': {
      const vals = fd.getAll(name).map(String).filter((v) => opts(d).includes(v))
      return vals.length ? vals : undefined
    }
    case 'number': case 'currency': {
      if (!raw) return undefined
      const n = Number(raw.replace(/[$,\s]/g, ''))
      if (!Number.isFinite(n)) throw new Error(`${d.label}: enter a number`)
      return d.data_type === 'currency' ? Math.round(n * 100) / 100 : n
    }
    case 'date':
      if (!raw) return undefined
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${d.label}: enter a date`)
      return raw
    case 'hyperlink':
      if (!raw) return undefined
      if (!/^https?:\/\//i.test(raw)) throw new Error(`${d.label}: links start with https://`)
      return raw.slice(0, 2000)
    case 'single_select': return raw && opts(d).includes(raw) ? raw : undefined
    case 'long_text': return raw ? raw.slice(0, 8000) : undefined
    default: return raw ? raw.slice(0, 500) : undefined
  }
}

export function formatField(d: FieldDef, v: unknown): string {
  if (v == null) return ''
  switch (d.data_type) {
    case 'boolean': return v ? 'Yes' : 'No'
    case 'multi_select': return Array.isArray(v) ? v.join(', ') : ''
    case 'currency': return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(v))
    case 'date': return new Date(`${v}T12:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
    default: return String(v)
  }
}
