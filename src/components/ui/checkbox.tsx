import { cn } from '@/lib/utils'

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={cn('size-4 rounded border-border-strong accent-brand', className)} {...props} />
}
