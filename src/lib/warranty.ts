export const CLAIM_STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger' | 'warning' }> = {
  open: { label: 'Open', tone: 'warning' }, scheduled: { label: 'Scheduled', tone: 'brand' }, resolved: { label: 'Resolved', tone: 'success' }, closed: { label: 'Closed', tone: 'neutral' },
}
export const APPT_STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger' | 'warning' }> = {
  scheduled: { label: 'Scheduled', tone: 'warning' }, confirmed: { label: 'Confirmed', tone: 'brand' }, completed: { label: 'Completed', tone: 'success' },
  missed: { label: 'Missed', tone: 'danger' }, cancelled: { label: 'Cancelled', tone: 'neutral' },
}
export const PRIORITY: Record<string, { label: string; tone: 'neutral' | 'danger' | 'warning' }> = {
  low: { label: 'Low', tone: 'neutral' }, normal: { label: 'Normal', tone: 'neutral' }, urgent: { label: 'Urgent', tone: 'danger' },
}
export const CLAIM_CATEGORIES = ['Plumbing', 'Electrical', 'HVAC', 'Doors and windows', 'Drywall and paint', 'Flooring', 'Cabinets and counters', 'Roofing', 'Exterior', 'Foundation', 'Other']
