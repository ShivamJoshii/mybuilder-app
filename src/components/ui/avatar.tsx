import { cn } from '@/lib/utils'

export function Avatar({ text, className, color }: { text: string; className?: string; color?: string }) {
  return (
    <span
      className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand', className)}
      style={color ? { background: color, color: 'white' } : undefined}
    >
      {text}
    </span>
  )
}
