import { z } from 'zod'

export const PORTAL_TOGGLES = [
  ['submit_change_orders', 'Can request change orders'], ['submit_warranty_claims', 'Can submit warranty claims'],
  ['see_locked_selections', 'Sees locked selections'], ['job_price_summary', 'Sees the contract and payments summary'],
  ['invoices', 'Sees invoices'], ['purchase_orders', 'Sees purchase orders and bills (open-book)'],
  ['budget', 'Sees budget vs. actual cost (open-book)'], ['pm_contact', 'Sees project manager contact info'],
] as const

/** Client portal settings from a form (company defaults and per-job overrides use the same fields). */
export function parsePortalSettings(fd: FormData) {
  return {
    schedule: z.enum(['none', 'phases', 'all']).parse(fd.get('schedule') ?? 'phases'),
    schedule_days_ahead: z.coerce.number().int().min(0).max(365).parse(fd.get('schedule_days_ahead') ?? 30),
    ...Object.fromEntries(PORTAL_TOGGLES.map(([k]) => [k, fd.get(k) === 'on'])),
  }
}
