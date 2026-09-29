export const SUBMITTAL_STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger' | 'warning'; ball: 'builder' | 'sub' | 'reviewer' | null }> = {
  draft: { label: 'Draft', tone: 'neutral', ball: 'builder' },
  requested: { label: 'Requested', tone: 'warning', ball: 'sub' },
  submitted: { label: 'In review', tone: 'brand', ball: 'reviewer' },
  revise: { label: 'Revise and resubmit', tone: 'danger', ball: 'sub' },
  approved: { label: 'Approved', tone: 'success', ball: null },
  approved_as_noted: { label: 'Approved as noted', tone: 'success', ball: null },
  rejected: { label: 'Rejected', tone: 'danger', ball: null },
  closed: { label: 'Closed', tone: 'neutral', ball: null },
}
export const SUBMITTAL_KINDS: Record<string, string> = { shop_drawing: 'Shop drawing', product_data: 'Product data', sample: 'Sample', mock_up: 'Mock-up', other: 'Other' }
export const DECISIONS: Record<string, string> = { approved: 'Approved', approved_as_noted: 'Approved as noted', revise: 'Revise and resubmit', rejected: 'Rejected' }
