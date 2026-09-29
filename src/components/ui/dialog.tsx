'use client'
import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

export function DialogContent({
  title, description, children, className, side,
}: { title: string; description?: string; children: React.ReactNode; className?: string; side?: 'right' }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/30" />
      <D.Content
        className={cn(
          'fixed z-50 flex flex-col bg-surface shadow-xl focus:outline-none',
          side === 'right'
            ? 'inset-y-0 right-0 w-full max-w-sm border-l border-border'
            : 'left-1/2 top-[10vh] max-h-[80vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-lg border border-border',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div>
            <D.Title className="text-[15px] font-semibold">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-[13px] text-text-3">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close className="rounded p-1 text-text-3 hover:bg-surface-2" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  )
}
