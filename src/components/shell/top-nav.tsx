'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Bell, Building2, ChevronDown, HelpCircle, LogOut, Menu as MenuIcon, MessagesSquare, Search, Settings, X } from 'lucide-react'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/dropdown'
import { Avatar } from '@/components/ui/avatar'
import { navFor, type Mode } from '@/lib/modules'
import { cn } from '@/lib/utils'

export type TopNavProps = {
  mode: Mode
  /** Module keys the user's role can view (builder mode). null = portal user, no filtering. */
  allowedModules: string[] | null
  settings: { label: string; href: string }[]
  userInitials: string
  userName: string
  userEmail: string
}

export function TopNav({ mode, allowedModules, settings, userInitials, userName, userEmail }: TopNavProps) {
  const pathname = usePathname()
  const allowed = allowedModules ? new Set(allowedModules) : null
  const groups = navFor(mode)
    .map((g) => ({ ...g, items: g.items.filter((i) => !allowed || !i.module || allowed.has(i.module)) }))
    .filter((g) => g.items.length > 0)
  const [drawer, setDrawer] = useState(false)
  const activeGroup = groups.find((g) => g.items.some((i) => pathname === i.href || pathname.startsWith(i.href + '/')))?.label

  return (
    <header className="sticky top-0 z-30 bg-nav text-nav-text">
      <div className="flex h-12 items-center gap-1 px-3">
        <button className="rounded p-1.5 hover:bg-nav-2 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
          <MenuIcon className="size-5" />
        </button>
        <Link href="/summary" className="mr-3 flex items-center gap-2 font-semibold text-white">
          <span className="flex size-7 items-center justify-center rounded bg-brand"><Building2 className="size-4" /></span>
          <span className="hidden sm:inline">MyBuilder</span>
        </Link>

        <nav className="hidden items-center lg:flex" aria-label="Main">
          {groups.map((g) => (
            <Menu key={g.label} modal={false}>
              <MenuTrigger
                className={cn(
                  'flex h-12 items-center gap-1 px-3 text-[13px] font-medium outline-none hover:bg-nav-2 data-[state=open]:bg-nav-2',
                  activeGroup === g.label && 'text-white shadow-[inset_0_-2px_0_var(--brand)]',
                )}
              >
                {g.label}
                <ChevronDown className="size-3.5 opacity-60" />
              </MenuTrigger>
              <MenuContent className="min-w-56">
                {g.items.map((i) => (
                  <MenuItem key={i.href} asChild>
                    <Link href={i.href}>
                      <i.icon />
                      <span className="flex-1">{i.label}</span>
                      {i.isNew && <span className="rounded bg-brand-soft px-1 text-[10px] font-semibold text-brand">New</span>}
                    </Link>
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <form action="/search" className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-nav-text/60" />
            <input
              name="q"
              placeholder="Search jobs and records"
              className="h-8 w-56 rounded-md border border-white/10 bg-nav-2 pl-8 pr-2 text-[13px] text-white placeholder:text-nav-text/50 focus:w-72 focus:outline-none focus:ring-2 focus:ring-brand/60"
            />
          </form>
          <Link href="/notifications" className="rounded p-2 hover:bg-nav-2" aria-label="Notifications"><Bell className="size-4" /></Link>
          <Link href="/chat" className="rounded p-2 hover:bg-nav-2" aria-label="Chat"><MessagesSquare className="size-4" /></Link>
          <Menu modal={false}>
            <MenuTrigger className="rounded p-2 outline-none hover:bg-nav-2" aria-label="Help"><HelpCircle className="size-4" /></MenuTrigger>
            <MenuContent align="end">
              <MenuItem asChild><a href="mailto:support@mybuilder.ca">Email support</a></MenuItem>
              <MenuItem asChild><Link href="/legal">Legal</Link></MenuItem>
            </MenuContent>
          </Menu>
          <Menu modal={false}>
            <MenuTrigger className="ml-1 rounded-full outline-none ring-offset-2 ring-offset-nav focus-visible:ring-2" aria-label="Account">
              <Avatar text={userInitials} className="bg-brand text-white" />
            </MenuTrigger>
            <MenuContent align="end" className="min-w-60">
              <div className="px-2 py-1.5">
                <div className="text-[13px] font-medium">{userName}</div>
                <div className="text-xs text-text-3">{userEmail}</div>
              </div>
              <MenuSeparator />
              {settings.length > 0 && <MenuLabel>Settings</MenuLabel>}
              {settings.map((s) => (
                <MenuItem key={s.href} asChild><Link href={s.href}><Settings />{s.label}</Link></MenuItem>
              ))}
              <MenuItem asChild><Link href="/settings/profile"><Settings />My profile</Link></MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => (document.getElementById('signout-form') as HTMLFormElement | null)?.requestSubmit()}>
                <LogOut />Sign out
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      <form id="signout-form" action="/auth/signout" method="post" hidden />
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-surface text-text shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-semibold">Menu</span>
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="rounded p-1 hover:bg-surface-2"><X className="size-4" /></button>
            </div>
            {groups.map((g) => (
              <details key={g.label} className="border-b border-border" open={g.label === activeGroup}>
                <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-semibold">{g.label}</summary>
                <div className="pb-2">
                  {g.items.map((i) => (
                    <Link key={i.href} href={i.href} onClick={() => setDrawer(false)}
                      className={cn('flex items-center gap-2 px-6 py-1.5 text-[13px] hover:bg-surface-2', pathname.startsWith(i.href) && 'font-medium text-brand')}>
                      <i.icon className="size-4 text-text-3" />{i.label}
                    </Link>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
