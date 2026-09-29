import * as React from 'react'
import { cn } from '@/lib/utils'

const field =
  'w-full rounded-md border border-border-strong bg-surface px-2.5 text-sm text-text placeholder:text-text-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-surface-2 disabled:text-text-3'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, 'h-8', className)} {...props} />
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, 'min-h-20 py-1.5', className)} {...props} />
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, 'h-8 pr-7', className)} {...props} />
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-[13px] font-medium text-text-2', className)} {...props} />
}

export function Field({
  label, htmlFor, hint, error, required, children, className,
}: {
  label: string; htmlFor?: string; hint?: string; error?: string; required?: boolean
  children: React.ReactNode; className?: string
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-text-3">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
