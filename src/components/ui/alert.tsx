import { cn } from '@/lib/utils'

export function Alert({ tone = 'danger', children, className }: { tone?: 'danger' | 'success' | 'info'; children: React.ReactNode; className?: string }) {
  const t = tone === 'danger' ? 'bg-danger-soft text-danger border-danger/20'
    : tone === 'success' ? 'bg-success-soft text-success border-success/20'
    : 'bg-brand-soft text-brand border-brand/20'
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-md border px-3 py-2 text-[13px]', t, className)}>{children}</div>
}
