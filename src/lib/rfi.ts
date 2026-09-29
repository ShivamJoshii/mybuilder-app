export const RFI_STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' }> = {
  not_sent: { label: 'Not sent', tone: 'neutral' }, sent: { label: 'Sent', tone: 'brand' },
  completed: { label: 'Completed', tone: 'success' }, reopened: { label: 'Reopened', tone: 'warning' },
}
