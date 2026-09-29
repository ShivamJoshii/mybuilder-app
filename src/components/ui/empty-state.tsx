import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon, title, body, action,
}: { icon: LucideIcon; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-3">
        <Icon className="size-6" />
      </div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-[13px] text-text-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
