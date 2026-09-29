import { describe, expect, it } from 'vitest'
import { mondayOf, weekOvertime, OT_RULES } from './overtime'

describe('overtime', () => {
  it('Alberta daily overtime', () => {
    expect(weekOvertime([10, 8, 8, 8, 8])).toEqual({ total: 42, regular: 40, overtime: 2 })
  })
  it('Alberta weekly overtime on top of daily', () => {
    expect(weekOvertime([9, 9, 9, 9, 9, 5])).toEqual({ total: 50, regular: 44, overtime: 6 })
  })
  it('Ontario is weekly only', () => {
    expect(weekOvertime([12, 12, 12, 12], OT_RULES.ON)).toEqual({ total: 48, regular: 44, overtime: 4 })
  })
  it('finds the Monday', () => {
    expect(mondayOf('2026-10-04')).toBe('2026-09-28')   // Sunday
    expect(mondayOf('2026-09-28')).toBe('2026-09-28')
  })
})
