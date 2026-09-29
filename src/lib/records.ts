/** Human labels + links for record types that comments, related items and search point at. */
export const RECORD_TYPES: Record<string, { label: string; href: (jobId: string, id: string) => string }> = {
  job: { label: 'Job', href: (_j, id) => `/jobs/${id}` },
  daily_log: { label: 'Daily log', href: (_j, id) => `/daily-logs/${id}` },
  file: { label: 'File', href: (_j, id) => `/documents?file=${id}` },
  change_order: { label: 'Change order', href: (_j, id) => `/change-orders/${id}` },
  selection: { label: 'Selection', href: (_j, id) => `/selections/${id}` },
  rfi: { label: 'RFI', href: (_j, id) => `/rfis/${id}` },
  todo: { label: 'To-do', href: (_j, id) => `/todos/${id}` },
  purchase_order: { label: 'Purchase order', href: (_j, id) => `/purchase-orders/${id}` },
  warranty: { label: 'Warranty claim', href: (_j, id) => `/warranty/${id}` },
  warranty_claim: { label: 'Warranty claim', href: (_j, id) => `/warranty/${id}` },
  bill: { label: 'Bill', href: (_j, id) => `/bills/${id}` },
  bid_package: { label: 'Bid package', href: (_j, id) => `/bids/${id}` },
  proposal: { label: 'Proposal', href: (_j, id) => `/proposals/${id}` },
  invoice: { label: 'Invoice', href: (_j, id) => `/invoices/${id}` },
  plan_sheet: { label: 'Plan sheet', href: (_j, id) => `/plans/${id}` },
  schedule_item: { label: 'Schedule item', href: (_j, id) => `/schedule/${id}` },
}

export const recordLabel = (t: string) => RECORD_TYPES[t]?.label ?? t.replace(/_/g, ' ')
export const recordHref = (t: string, jobId: string, id: string) => RECORD_TYPES[t]?.href(jobId, id) ?? `/jobs/${jobId}`
