'use client'
import * as M from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

export const Menu = M.Root
export const MenuTrigger = M.Trigger
export const MenuGroup = M.Group

export function MenuContent({ className, align = 'start', ...props }: M.DropdownMenuContentProps) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-48 rounded-md border border-border bg-surface p-1 text-text shadow-lg', className)}
        {...props}
      />
    </M.Portal>
  )
}

export function MenuItem({ className, ...props }: M.DropdownMenuItemProps) {
  return (
    <M.Item
      className={cn('flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-text-3', className)}
      {...props}
    />
  )
}

export function MenuLabel({ className, ...props }: M.DropdownMenuLabelProps) {
  return <M.Label className={cn('px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-3', className)} {...props} />
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />
}
