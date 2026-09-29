import { describe, expect, it } from 'vitest'
import { utcToZonedInput, zonedToUtc } from './utils'

describe('time zones', () => {
  it('converts Edmonton wall time to UTC across DST', () => {
    expect(zonedToUtc('2026-07-15T17:00')).toBe('2026-07-15T23:00:00.000Z')   // MDT −6
    expect(zonedToUtc('2026-12-15T17:00')).toBe('2026-12-16T00:00:00.000Z')   // MST −7
  })
  it('round-trips', () => {
    expect(utcToZonedInput(zonedToUtc('2026-11-01T09:30'))).toBe('2026-11-01T09:30')
  })
})
