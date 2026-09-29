// Default sales tax charged to the client, by the job's province.
// HST provinces use one combined rate. Elsewhere we default to GST only:
// PST/RST/QST on construction is usually built into the builder's material
// cost (BC, MB, SK) — builders can change the rate per estimate.
export const PROVINCE_TAX: Record<string, { rate: number; label: string }> = {
  AB: { rate: 5, label: 'GST' },
  BC: { rate: 5, label: 'GST' },
  MB: { rate: 5, label: 'GST' },
  SK: { rate: 5, label: 'GST' },
  QC: { rate: 14.975, label: 'GST + QST' },
  ON: { rate: 13, label: 'HST' },
  NB: { rate: 15, label: 'HST' },
  NL: { rate: 15, label: 'HST' },
  NS: { rate: 14, label: 'HST' },
  PE: { rate: 15, label: 'HST' },
  NT: { rate: 5, label: 'GST' },
  NU: { rate: 5, label: 'GST' },
  YT: { rate: 5, label: 'GST' },
}

export function taxFor(province: string | null | undefined) {
  return PROVINCE_TAX[(province ?? '').toUpperCase()] ?? { rate: 5, label: 'GST' }
}
