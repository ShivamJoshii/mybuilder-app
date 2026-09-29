'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function SettingsNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname().startsWith(href)
  return (
    <Link href={href} className={cn('block whitespace-nowrap rounded px-2 py-1.5 text-[13px]', active ? 'bg-brand-soft font-medium text-brand' : 'text-text-2 hover:bg-surface-2')}>
      {children}
    </Link>
  )
}
