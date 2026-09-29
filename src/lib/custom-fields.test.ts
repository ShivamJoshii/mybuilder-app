import { describe, expect, it } from 'vitest'
import { formatField, readField, type FieldDef } from './custom-fields'

const def = (data_type: string, options: string[] = []): FieldDef => ({
  id: 'f', label: 'Field', data_type, options, tooltip: null, is_required: false, visible_to_subs: false, visible_to_clients: false,
})
const form = (entries: [string, string][]) => { const fd = new FormData(); for (const [k, v] of entries) fd.append(k, v); return fd }

describe('custom field values', () => {
  it('reads each type from a form', () => {
    expect(readField(def('text'), form([['cf_f', '  BP-114 ']]))).toBe('BP-114')
    expect(readField(def('currency'), form([['cf_f', '$1,250.555']]))).toBe(1250.56)
    expect(readField(def('boolean'), form([]))).toBe(false)
    expect(readField(def('single_select', ['Grey', 'White']), form([['cf_f', 'Purple']]))).toBeUndefined()
    expect(readField(def('multi_select', ['A', 'B']), form([['cf_f', 'A'], ['cf_f', 'Z'], ['cf_f', 'B']]))).toEqual(['A', 'B'])
    expect(readField(def('date'), form([['cf_f', '']]))).toBeUndefined()
  })
  it('rejects bad input', () => {
    expect(() => readField(def('number'), form([['cf_f', 'twelve']]))).toThrow('enter a number')
    expect(() => readField(def('hyperlink'), form([['cf_f', 'javascript:alert(1)']]))).toThrow('https://')
  })
  it('formats for display', () => {
    expect(formatField(def('currency'), 1250.5)).toBe('$1,250.50')
    expect(formatField(def('boolean'), true)).toBe('Yes')
    expect(formatField(def('multi_select'), ['A', 'B'])).toBe('A, B')
  })
})

describe('custom field filters', () => {
  it('matches selects, booleans and text', async () => {
    const { matchesCustomFilters } = await import('./custom-fields')
    const sel = def('single_select', ['Grey', 'White']), yes = { ...def('boolean'), id: 'b' }, txt = { ...def('text'), id: 't' }
    const vals = new Map<string, unknown>([['f', 'Grey'], ['b', true], ['t', 'BP-2026-114']])
    expect(matchesCustomFilters([sel, yes, txt], vals, { cf_f: ['Grey'], cf_b: 'yes', cf_t: 'bp-2026' })).toBe(true)
    expect(matchesCustomFilters([sel], vals, { cf_f: 'White' })).toBe(false)
    expect(matchesCustomFilters([yes], new Map(), { cf_b: 'yes' })).toBe(false)
    expect(matchesCustomFilters([sel], vals, {})).toBe(true)
  })
})
