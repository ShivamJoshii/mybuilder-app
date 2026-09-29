import { cn } from '@/lib/utils'

const tones = {
  neutral: 'bg-surface-2 text-text-2 border-border',
  brand: 'bg-brand-soft text-brand border-brand/20',
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
} as const

export function Badge({ tone = 'neutral', className, children }: { tone?: keyof typeof tones; className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center rounded border px-1.5 py-px text-xs font-medium', tones[tone], className)}>{children}</span>
}

export function JobStatusBadge({ status }: { status: string }) {
  const tone = status === 'open' ? 'success' : status === 'presale' ? 'brand' : status === 'warranty' ? 'warning' : 'neutral'
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return <Badge tone={tone}>{label}</Badge>
}
