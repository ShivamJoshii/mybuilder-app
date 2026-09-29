export const SELECTION_STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' }> = {
  draft: { label: 'Not released', tone: 'neutral' },
  pending: { label: 'Awaiting choice', tone: 'warning' },
  selected: { label: 'Selected', tone: 'brand' },
  approved: { label: 'Approved', tone: 'success' },
}
export const SELECTION_CATEGORIES = ['Flooring', 'Tile', 'Cabinets', 'Countertops', 'Plumbing fixtures', 'Lighting', 'Appliances', 'Paint', 'Doors and hardware', 'Exterior', 'Other']
