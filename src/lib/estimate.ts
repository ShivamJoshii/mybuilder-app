// Estimate money math. Mirrors public.item_cost / public.item_price in the database.
export type CostType = 'labor' | 'material' | 'equipment' | 'subcontractor' | 'other' | 'none'
export type MarkupType = 'percent' | 'amount'
export type MarkedAs = 'none' | 'allowance' | 'bid' | 'selection'

export type EstGroup = { id: string; name: string; sort: number; is_optional: boolean; option_status: 'pending' | 'approved' | 'declined' }
export type EstItem = {
  id: string; group_id: string | null; cost_code_id: string | null; cost_type: CostType
  title: string; description: string | null; internal_notes: string | null
  quantity: number; unit: string; unit_cost: number; markup_type: MarkupType; markup_value: number
  taxable: boolean; marked_as: MarkedAs; sort: number
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const itemCost = (i: Pick<EstItem, 'quantity' | 'unit_cost'>) => r2(Number(i.quantity) * Number(i.unit_cost))
export function itemPrice(i: Pick<EstItem, 'quantity' | 'unit_cost' | 'markup_type' | 'markup_value'>) {
  const cost = Number(i.quantity) * Number(i.unit_cost)
  return r2(cost + (i.markup_type === 'percent' ? cost * Number(i.markup_value) / 100 : Number(i.markup_value)))
}

/** Totals for the base scope (optional groups excluded), like a released proposal. */
export function totals(items: EstItem[], groups: EstGroup[], taxRate: number) {
  const optional = new Set(groups.filter((g) => g.is_optional).map((g) => g.id))
  const base = items.filter((i) => !i.group_id || !optional.has(i.group_id))
  const cost = r2(base.reduce((s, i) => s + itemCost(i), 0))
  const price = r2(base.reduce((s, i) => s + itemPrice(i), 0))
  const taxable = base.filter((i) => i.taxable).reduce((s, i) => s + itemPrice(i), 0)
  const tax = r2(taxable * taxRate / 100)
  const profit = r2(price - cost)
  return { cost, price, tax, total: r2(price + tax), profit, margin: price ? r2(profit / price * 100) : 0 }
}

export const COST_TYPES: { value: CostType; label: string }[] = [
  { value: 'material', label: 'Material' }, { value: 'labor', label: 'Labour' }, { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'equipment', label: 'Equipment' }, { value: 'other', label: 'Other' }, { value: 'none', label: 'None' },
]
export const MARKED_AS: { value: MarkedAs; label: string }[] = [
  { value: 'none', label: '—' }, { value: 'allowance', label: 'Allowance' }, { value: 'bid', label: 'Bid' }, { value: 'selection', label: 'Selection' },
]

export type SnapshotGroup = { id: string; name: string; sort: number; optional: boolean; total: number
  lines: { title: string; description: string | null; quantity: number; unit: string; price: number; taxable: boolean }[] }

export const PROPOSAL_STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  released: { label: 'Awaiting client', tone: 'brand' },
  approved: { label: 'Approved', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
}

export const CO_STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger' | 'warning' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending: { label: 'Awaiting approval', tone: 'brand' },
  approved: { label: 'Approved', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
}
export type SnapshotLine = { title: string; description: string | null; quantity: number; unit: string; price: number; taxable: boolean }
