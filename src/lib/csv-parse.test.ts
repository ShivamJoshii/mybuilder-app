import { describe, expect, it } from 'vitest'
import { normHeader, parseCsv, parseDate, parseMoney } from './csv-parse'

describe('csv import parsing', () => {
  it('handles quotes, commas, newlines and BOM', () => {
    expect(parseCsv('﻿Name,Notes\r\n"Smith, J","He said ""hi""\nthen left"\r\n\r\nLee,ok\n')).toEqual([
      ['Name', 'Notes'], ['Smith, J', 'He said "hi"\nthen left'], ['Lee', 'ok'],
    ])
  })
  it('normalises headers and values', () => {
    expect(normHeader('Job_Name ')).toBe('job name')
    expect(parseDate('3/7/2026')).toBe('2026-03-07')
    expect(parseDate('2026-11-04T00:00:00')).toBe('2026-11-04')
    expect(parseDate('nope')).toBeUndefined()
    expect(parseMoney('$1,250,000.50')).toBe(1250000.5)
    expect(parseMoney('(200)')).toBe(-200)
  })
})
