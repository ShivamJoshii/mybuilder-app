import { describe, expect, it } from 'vitest'
import { addWorkdays, cascade, createsCycle, criticalPath, endFor, isWorkday, nextWorkday, workdaysBetween, type Calendar, type Item, type Link } from './calendar'

const weekdays: Calendar = { workDays: [1, 2, 3, 4, 5], exceptions: [] }

describe('workday calendar', () => {
  it('skips weekends', () => {
    // 2026-10-02 is a Friday
    expect(isWorkday('2026-10-02', weekdays)).toBe(true)
    expect(isWorkday('2026-10-03', weekdays)).toBe(false)
    expect(nextWorkday('2026-10-03', weekdays)).toBe('2026-10-05')
    expect(addWorkdays('2026-10-02', 1, weekdays)).toBe('2026-10-05')
    expect(addWorkdays('2026-10-05', -1, weekdays)).toBe('2026-10-02')
  })
  it('computes end dates from durations', () => {
    expect(endFor('2026-10-01', 1, weekdays)).toBe('2026-10-01')
    expect(endFor('2026-10-01', 5, weekdays)).toBe('2026-10-07')
    expect(workdaysBetween('2026-10-01', '2026-10-07', weekdays)).toBe(5)
  })
  it('honours holidays and extra workdays', () => {
    const cal: Calendar = {
      workDays: [1, 2, 3, 4, 5],
      exceptions: [
        { type: 'non_workday', start_date: '2026-10-12', end_date: '2026-10-12', repeat_annually: true }, // Thanksgiving
        { type: 'extra_workday', start_date: '2026-10-17', end_date: '2026-10-17', repeat_annually: false }, // a Saturday
      ],
    }
    expect(isWorkday('2026-10-12', cal)).toBe(false)
    expect(isWorkday('2027-10-12', cal)).toBe(false)   // repeats yearly
    expect(isWorkday('2026-10-17', cal)).toBe(true)
    expect(endFor('2026-10-09', 2, cal)).toBe('2026-10-13') // Fri + Tue (Mon is holiday)
  })
  it('handles repeating ranges across the new year', () => {
    const cal: Calendar = { workDays: [1, 2, 3, 4, 5], exceptions: [{ type: 'non_workday', start_date: '2026-12-24', end_date: '2027-01-02', repeat_annually: true }] }
    expect(isWorkday('2027-12-30', cal)).toBe(false)
    expect(isWorkday('2028-01-03', cal)).toBe(true)
  })
})

describe('dependencies', () => {
  const items: Item[] = [
    { id: 'dig', start_date: '2026-10-05', duration: 2, end_date: '2026-10-06' },
    { id: 'pour', start_date: '2026-10-05', duration: 1, end_date: '2026-10-05' },
    { id: 'frame', start_date: '2026-10-05', duration: 5, end_date: '2026-10-09' },
    { id: 'roof', start_date: '2026-10-05', duration: 2, end_date: '2026-10-06' },
  ]
  const links: Link[] = [
    { predecessor_id: 'dig', successor_id: 'pour', type: 'FS', lag_days: 0 },
    { predecessor_id: 'pour', successor_id: 'frame', type: 'FS', lag_days: 2 },  // cure time
    { predecessor_id: 'frame', successor_id: 'roof', type: 'SS', lag_days: 3 },
  ]
  it('cascades finish-to-start and start-to-start with lag', () => {
    const out = Object.fromEntries(cascade(items, links, weekdays).map((i) => [i.id, i]))
    expect(out.pour.start_date).toBe('2026-10-07')
    expect(out.frame.start_date).toBe('2026-10-12')     // pour ends Wed 7th, next workday Thu 8th, +2 lag = Mon 12th
    expect(out.frame.end_date).toBe('2026-10-16')
    expect(out.roof.start_date).toBe('2026-10-15')      // 3 workdays after framing starts
  })
  it('only moves items downstream of the change', () => {
    const out = cascade(items, links, weekdays, ['frame'])
    expect(out.map((i) => i.id)).toEqual(['roof'])
  })
  it('uses the latest predecessor', () => {
    const extra: Link[] = [...links, { predecessor_id: 'dig', successor_id: 'roof', type: 'FS', lag_days: 20 }]
    const out = Object.fromEntries(cascade(items, extra, weekdays).map((i) => [i.id, i]))
    expect(out.roof.start_date).toBe(addWorkdays('2026-10-07', 20, weekdays))
  })
  it('detects loops', () => {
    expect(createsCycle(links, { predecessor_id: 'roof', successor_id: 'dig', type: 'FS', lag_days: 0 })).toBe(true)
    expect(createsCycle(links, { predecessor_id: 'dig', successor_id: 'roof', type: 'FS', lag_days: 0 })).toBe(false)
    expect(() => cascade(items, [...links, { predecessor_id: 'roof', successor_id: 'dig', type: 'FS', lag_days: 0 }], weekdays)).toThrow()
  })
  it('finds the critical path', () => {
    const scheduled = items.map((i) => ({ ...i, ...(cascade(items, links, weekdays).find((c) => c.id === i.id) ?? {}) }))
    const side: Item = { id: 'permit', start_date: '2026-10-05', duration: 1, end_date: '2026-10-05' }
    const cp = criticalPath([...scheduled, side], links, weekdays)
    expect(cp.has('dig')).toBe(true)
    expect(cp.has('frame')).toBe(true)
    expect(cp.has('permit')).toBe(false)
  })
})
