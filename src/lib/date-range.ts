export const DATE_PRESETS = [
  { value: 'all', label: 'All dates' },
  { value: 'custom', label: 'Custom dates' },
  { value: 'today', label: 'Today' },
  { value: 'today_yesterday', label: 'Today & yesterday' },
  { value: 'past_7', label: 'Past 7 days' },
  { value: 'past_14', label: 'Past 14 days' },
  { value: 'past_30', label: 'Past 30 days' },
  { value: 'past_45', label: 'Past 45 days' },
  { value: 'past_60', label: 'Past 60 days' },
  { value: 'past_90', label: 'Past 90 days' },
] as const

export type DatePreset = (typeof DATE_PRESETS)[number]['value']

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** Resolve a preset (and optional custom bounds) to inclusive ISO dates. */
export function resolveDateRange(preset: string | undefined, from?: string, to?: string, today = new Date()): { from?: string; to?: string } {
  const t = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  const minus = (n: number) => { const d = new Date(t); d.setUTCDate(d.getUTCDate() - n); return iso(d) }
  switch (preset) {
    case 'today': return { from: iso(t), to: iso(t) }
    case 'today_yesterday': return { from: minus(1), to: iso(t) }
    case 'custom': return { from: from || undefined, to: to || undefined }
    default: {
      const m = /^past_(\d+)$/.exec(preset ?? '')
      if (m) return { from: minus(Number(m[1]) - 1), to: iso(t) }
      return {}
    }
  }
}
