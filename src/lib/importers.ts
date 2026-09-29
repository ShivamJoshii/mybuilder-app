import { normHeader } from './csv-parse'

export type ImportKind = 'jobs' | 'leads' | 'subs' | 'cost_codes'
export type ImportField = { key: string; label: string; required?: boolean; aliases: string[] }

/** Columns we understand, with the header names Buildertrend and common spreadsheets use. */
export const IMPORTERS: Record<ImportKind, { label: string; module: string; verb: 'add'; fields: ImportField[]; hint: string }> = {
  jobs: {
    label: 'Jobs', module: 'jobs', verb: 'add', hint: 'One row per job. Status can be Open, Presale, Warranty or Closed.',
    fields: [
      { key: 'title', label: 'Job name', required: true, aliases: ['job name', 'name', 'job', 'title', 'job title'] },
      { key: 'status', label: 'Status', aliases: ['status', 'job status'] },
      { key: 'job_type', label: 'Job type', aliases: ['job type', 'type', 'project type'] },
      { key: 'street', label: 'Street', aliases: ['street', 'street address', 'address', 'job address', 'address 1'] },
      { key: 'city', label: 'City', aliases: ['city', 'town'] },
      { key: 'province', label: 'Province', aliases: ['province', 'prov', 'state'] },
      { key: 'postal_code', label: 'Postal code', aliases: ['postal code', 'postal', 'zip', 'zip code', 'postcode'] },
      { key: 'permit_number', label: 'Permit #', aliases: ['permit', 'permit number', 'permit #', 'permit no'] },
      { key: 'lot_info', label: 'Lot', aliases: ['lot', 'lot info', 'lot information', 'legal'] },
      { key: 'projected_start', label: 'Projected start', aliases: ['projected start', 'start', 'start date', 'projected start date'] },
      { key: 'projected_end', label: 'Projected completion', aliases: ['projected completion', 'projected end', 'end', 'end date', 'completion', 'projected completion date'] },
      { key: 'contract_price', label: 'Contract price', aliases: ['contract price', 'contract', 'price', 'contract amount'] },
    ],
  },
  leads: {
    label: 'Leads', module: 'leads', verb: 'add', hint: 'Status and source are matched by name to your sales lists.',
    fields: [
      { key: 'title', label: 'Opportunity title', required: true, aliases: ['opportunity title', 'title', 'lead', 'lead title', 'opportunity', 'name'] },
      { key: 'contact_first', label: 'Contact first name', aliases: ['first name', 'contact first name', 'client first name', 'first'] },
      { key: 'contact_last', label: 'Contact last name', aliases: ['last name', 'contact last name', 'client last name', 'last'] },
      { key: 'contact_email', label: 'Email', aliases: ['email', 'contact email', 'client email', 'e mail'] },
      { key: 'contact_phone', label: 'Phone', aliases: ['phone', 'contact phone', 'cell', 'mobile', 'phone number'] },
      { key: 'site_street', label: 'Street', aliases: ['street', 'street address', 'address', 'site address'] },
      { key: 'site_city', label: 'City', aliases: ['city'] },
      { key: 'site_province', label: 'Province', aliases: ['province', 'state', 'prov'] },
      { key: 'site_postal', label: 'Postal code', aliases: ['postal code', 'zip', 'postal', 'zip code'] },
      { key: 'status', label: 'Status', aliases: ['status', 'lead status'] },
      { key: 'source', label: 'Source', aliases: ['source', 'lead source', 'sources'] },
      { key: 'confidence', label: 'Confidence %', aliases: ['confidence', 'confidence %', 'probability'] },
      { key: 'est_revenue_min', label: 'Est. revenue (min)', aliases: ['est revenue min', 'estimated revenue min', 'revenue min', 'estimated revenue', 'value'] },
      { key: 'est_revenue_max', label: 'Est. revenue (max)', aliases: ['est revenue max', 'estimated revenue max', 'revenue max'] },
      { key: 'projected_sale_date', label: 'Projected sale date', aliases: ['projected sale date', 'projected sales date', 'close date', 'expected close'] },
      { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'description', 'comments'] },
    ],
  },
  subs: {
    label: 'Subs and vendors', module: 'subs_vendors', verb: 'add', hint: 'Each row gets an invite link; nothing is emailed until you send it.',
    fields: [
      { key: 'company_name', label: 'Company', required: true, aliases: ['company', 'company name', 'name', 'vendor', 'sub', 'business name'] },
      { key: 'email', label: 'Email', required: true, aliases: ['email', 'primary email', 'e mail', 'contact email'] },
      { key: 'trade', label: 'Trade', aliases: ['trade', 'division', 'trades', 'category', 'division trade'] },
      { key: 'phone', label: 'Phone', aliases: ['phone', 'business phone', 'office phone', 'phone number'] },
      { key: 'first', label: 'Contact first name', aliases: ['first name', 'contact first name', 'first'] },
      { key: 'last', label: 'Contact last name', aliases: ['last name', 'contact last name', 'last'] },
    ],
  },
  cost_codes: {
    label: 'Cost codes', module: 'cost_codes', verb: 'add', hint: 'Missing categories are created. Existing codes are skipped.',
    fields: [
      { key: 'code', label: 'Code', required: true, aliases: ['code', 'cost code', 'number', 'cost code number'] },
      { key: 'title', label: 'Title', required: true, aliases: ['title', 'name', 'description', 'cost code name'] },
      { key: 'category', label: 'Category', aliases: ['category', 'cost category', 'group', 'division'] },
      { key: 'is_labor', label: 'Labour?', aliases: ['labor', 'labour', 'is labor', 'is labour', 'labor code'] },
    ],
  },
}

/** Guess which CSV column feeds each field. Returns field key → column index (or -1). */
export function autoMap(kind: ImportKind, headers: string[]): Record<string, number> {
  const norm = headers.map(normHeader)
  const used = new Set<number>()
  const out: Record<string, number> = {}
  for (const f of IMPORTERS[kind].fields) {
    let idx = norm.findIndex((h, i) => !used.has(i) && (h === normHeader(f.label) || f.aliases.includes(h)))
    if (idx < 0) idx = norm.findIndex((h, i) => !used.has(i) && f.aliases.some((a) => h.startsWith(a)))
    if (idx >= 0) used.add(idx)
    out[f.key] = idx
  }
  return out
}

export const IMPORT_MAX_ROWS = 2000
