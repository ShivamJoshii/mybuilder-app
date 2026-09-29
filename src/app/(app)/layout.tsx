import { getAppContext, can, hasAction } from '@/lib/context'
import { SETTINGS_NAV } from '@/lib/modules'
import { TopNav } from '@/components/shell/top-nav'
import { JobSidebar, type SwitchOption } from '@/components/shell/job-sidebar'
import { fullName, initials } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  const supabase = await createClient()
  const { count: unread } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)

  // Menu items are filtered by what the role can view (builder only; subs/clients get the portal set)
  const allowedModules = mode === 'builder'
    ? Object.entries(ctx.permissions.modules).filter(([, p]) => p.view).map(([k]) => k)
    : null

  const settings = mode === 'builder'
    ? SETTINGS_NAV.filter((s) => (s.module ? can(ctx, s.module) : true) && (s.action ? hasAction(ctx, s.action) : true))
        .map(({ label, href }) => ({ label, href }))
    : ctx.orgs.some((o) => o.kind === 'sub' && o.is_admin)
      ? [{ label: 'Company profile', href: '/settings/sub-profile' }]
      : []

  const options: SwitchOption[] = []
  for (const o of ctx.orgs.filter((o) => o.kind === 'builder')) {
    options.push({ id: o.org_id, label: o.name, sublabel: o.role_name ?? undefined, group: 'Your companies' })
  }
  for (const s of ctx.orgs.filter((o) => o.kind === 'sub')) {
    const builders = ctx.buildersAsSub.filter((b) => b.sub_org_id === s.org_id)
    options.push({ id: s.org_id, label: `All builders (${builders.length})`, sublabel: s.name, group: 'Builders you work with' })
    for (const b of builders) options.push({ id: b.builder_org_id, label: b.builder_name, sublabel: b.company_name, group: 'Builders you work with' })
  }
  for (const c of ctx.clientOrgs) options.push({ id: c.org_id, label: c.name, sublabel: 'Your project', group: 'Client portal' })

  const currentId =
    ctx.workspace.mode === 'builder' ? ctx.workspace.orgId
    : ctx.workspace.mode === 'sub' ? (ctx.workspace.builderOrgId ?? ctx.workspace.subOrgId)
    : ctx.workspace.orgId

  return (
    <div className="flex h-screen flex-col">
      <TopNav
        mode={mode}
        allowedModules={allowedModules}
        settings={settings}
        userInitials={initials(ctx.profile)}
        userName={fullName(ctx.profile)}
        userEmail={ctx.email}
        unread={unread ?? 0}
      />
      <div className="flex min-h-0 flex-1">
        <JobSidebar
          options={options}
          currentId={currentId}
          jobs={ctx.jobs.map(({ id, title, status, color, builder_name, projected_start, projected_end, created_at, is_template }) =>
            ({ id, title, status: is_template ? 'template' : status, color, builder_name, projected_start, projected_end, created_at }))}
          selection={ctx.selection}
          showBuilderNames={ctx.workspace.mode === 'sub' && !ctx.workspace.builderOrgId}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
