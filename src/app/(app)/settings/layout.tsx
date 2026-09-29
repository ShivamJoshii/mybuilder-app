import Link from 'next/link'
import { getAppContext, can, hasAction } from '@/lib/context'
import { SETTINGS_NAV } from '@/lib/modules'
import { SettingsNavLink } from './nav-link'

export default async function SettingsLayout({ children }: LayoutProps<'/settings'>) {
  const ctx = await getAppContext()
  const items = ctx.workspace.mode === 'builder'
    ? SETTINGS_NAV.filter((s) => (s.module ? can(ctx, s.module) : true) && (s.action ? hasAction(ctx, s.action) : true))
        .map(({ label, href }) => ({ label, href }))
    : [
        ...(ctx.orgs.some((o) => o.kind === 'sub' && o.is_admin) ? [{ label: 'Company profile', href: '/settings/sub-profile' }] : []),
        ...(ctx.orgs.some((o) => o.kind === 'sub') ? [{ label: 'Compliance documents', href: '/settings/compliance' }] : []),
      ]
  items.push({ label: 'My profile', href: '/settings/profile' }, { label: 'Notifications', href: '/settings/notifications' })
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <nav className="shrink-0 border-b border-border bg-surface p-3 md:w-56 md:border-b-0 md:border-r" aria-label="Settings">
        <Link href="/settings" className="mb-2 block px-2 text-xs font-semibold uppercase tracking-wide text-text-3">Settings</Link>
        <ul className="flex gap-1 overflow-x-auto md:block md:space-y-0.5">
          {items.map((i) => <li key={i.href}><SettingsNavLink href={i.href}>{i.label}</SettingsNavLink></li>)}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
