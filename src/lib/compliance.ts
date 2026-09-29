export const CERT_KINDS = {
  wcb_clearance: 'WCB clearance letter',
  liability_insurance: 'Commercial general liability',
  auto_insurance: 'Auto insurance',
  business_licence: 'Business licence',
  safety_cor: 'COR safety certificate',
  other: 'Other',
} as const
export type CertKind = keyof typeof CERT_KINDS
export const REQUIRABLE: CertKind[] = ['wcb_clearance', 'liability_insurance', 'auto_insurance', 'business_licence', 'safety_cor']

export const COMPLIANCE_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  ok: { label: 'Compliant', tone: 'success' },
  expiring: { label: 'Expiring soon', tone: 'warning' },
  review: { label: 'Needs review', tone: 'warning' },
  expired: { label: 'Expired', tone: 'danger' },
  missing: { label: 'Missing documents', tone: 'danger' },
}

/** Per-certificate state for display. */
export function certState(expires: string | null, today: string): 'ok' | 'expiring' | 'expired' {
  if (!expires) return 'ok'
  if (expires < today) return 'expired'
  const soon = new Date(`${today}T12:00:00Z`); soon.setUTCDate(soon.getUTCDate() + 30)
  return expires <= soon.toISOString().slice(0, 10) ? 'expiring' : 'ok'
}
