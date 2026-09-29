import { describe, expect, it } from 'vitest'
import { itemPrice, totals, type EstItem } from './estimate'

const item = (o: Partial<EstItem>): EstItem => ({ id: crypto.randomUUID(), group_id: null, cost_code_id: null, cost_type: 'material', title: 'x',
  description: null, internal_notes: null, quantity: 1, unit: 'ea', unit_cost: 0, markup_type: 'percent', markup_value: 0, taxable: true, marked_as: 'none', sort: 0, ...o })

describe('estimate math', () => {
  it('prices percent and flat markups', () => {
    expect(itemPrice(item({ quantity: 10, unit_cost: 100, markup_value: 20 }))).toBe(1200)
    expect(itemPrice(item({ quantity: 1, unit_cost: 500, markup_type: 'amount', markup_value: 250 }))).toBe(750)
  })
  it('matches the database proposal totals (optional groups excluded, tax on taxable lines)', () => {
    const g = [{ id: 'opt', name: 'Deck', sort: 2, is_optional: true, option_status: 'pending' as const }]
    const t = totals([
      item({ quantity: 10, unit_cost: 100, markup_value: 20 }),
      item({ quantity: 1, unit_cost: 500, markup_type: 'amount', markup_value: 250 }),
      item({ group_id: 'opt', unit_cost: 1000, markup_value: 10 }),
    ], g, 5)
    expect(t).toMatchObject({ cost: 1500, price: 1950, tax: 97.5, total: 2047.5, profit: 450 })
  })
  it('skips tax on non-taxable lines', () => {
    expect(totals([item({ unit_cost: 100, taxable: false })], [], 13).tax).toBe(0)
  })
})
