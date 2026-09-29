'use client'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

export function SubmitButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" size="lg" className={className ?? 'w-full'} disabled={pending}>
      {pending ? 'Working…' : children}
    </Button>
  )
}
