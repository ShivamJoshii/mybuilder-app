export const SIG_STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger' | 'warning' }> = {
  draft: { label: 'Draft', tone: 'neutral' }, sent: { label: 'Waiting for signatures', tone: 'warning' }, completed: { label: 'Completed', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' }, voided: { label: 'Voided', tone: 'neutral' },
}
