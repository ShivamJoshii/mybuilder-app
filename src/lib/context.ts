import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type Verb = 'view' | 'add' | 'edit' | 'delete' | 'cost' | 'price'
export type ModulePerm = { view: boolean; add: boolean; edit: boolean; delete: boolean; scope: string; cost: boolean; price: boolean }
export type Permissions = { modules: Record<string, ModulePerm>; actions: string[] }

export type OrgMembership = {
  org_id: string
  kind: 'builder' | 'sub'
  name: string
  logo_url: string | null
  role_id: string | null
  role_name: string | null
  is_admin: boolean
  all_jobs: boolean
  allowed_job_statuses: string[] | null
}

export type BuilderAsSub = {
  builder_org_id: string
  builder_name: string
  logo_url: string | null
  sub_org_id: string
  link_id: string
  company_name: string
}

export type PickerJob = {
  id: string
  title: string
  status: string
  color: string
  org_id: string
  builder_name: string | null
  street: string | null
  city: string | null
  projected_start: string | null
  projected_end: string | null
  created_at: string
}

/**
 * The workspace the user is looking at.
 *  builder: internal user inside a builder org
 *  sub:     sub/vendor user; scope is one builder or all builders they work with
 *  client:  homeowner portal
 */
export type Workspace =
  | { mode: 'builder'; orgId: string; orgName: string; roleName: string | null }
  | { mode: 'sub'; subOrgId: string; builderOrgId: string | null; scopeName: string }
  | { mode: 'client'; orgId: string; orgName: string }

export type AppContext = {
  userId: string
  email: string
  profile: { first_name: string; last_name: string; email: string; phone: string | null }
  orgs: OrgMembership[]
  buildersAsSub: BuilderAsSub[]
  clientOrgs: { org_id: string; name: string }[]
  workspace: Workspace
  selectionKey: string
  permissions: Permissions
  jobs: PickerJob[]
  selection: { allJobs: boolean; jobIds: string[] }
}

const NO_PERMS: Permissions = { modules: {}, actions: [] }

export const getUser = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  if (!sub) return null
  return { id: sub as string, email: (data.claims.email as string) ?? '' }
})

/** Loads everything the app shell needs. Redirects when signed out or not onboarded. */
export const getAppContext = cache(async (): Promise<AppContext> => {
  const user = await getUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const [{ data: ctxRaw }, { data: profile }] = await Promise.all([
    supabase.rpc('my_context'),
    supabase.from('profiles').select('first_name,last_name,email,phone').eq('id', user.id).single(),
  ])
  const ctx = (ctxRaw ?? {}) as {
    active_org_id: string | null
    orgs: OrgMembership[]
    builders_as_sub: BuilderAsSub[]
    client_orgs: { org_id: string; name: string }[]
  }
  const orgs = ctx.orgs ?? []
  const buildersAsSub = ctx.builders_as_sub ?? []
  const clientOrgs = ctx.client_orgs ?? []

  if (orgs.length === 0 && clientOrgs.length === 0) redirect('/onboarding')

  const workspace = resolveWorkspace(ctx.active_org_id, orgs, buildersAsSub, clientOrgs)
  const selectionKey =
    workspace.mode === 'builder' ? workspace.orgId
    : workspace.mode === 'sub' ? (workspace.builderOrgId ?? workspace.subOrgId)
    : workspace.orgId

  const permissions: Permissions =
    workspace.mode === 'builder'
      ? (((await supabase.rpc('my_permissions', { p_org: workspace.orgId })).data as Permissions | null) ?? NO_PERMS)
      : NO_PERMS

  // Jobs for the picker. RLS already limits rows to what the user may see.
  let q = supabase
    .from('jobs')
    .select('id,title,status,color,org_id,street,city,projected_start,projected_end,created_at')
    .is('deleted_at', null)
    .order('title')
  if (workspace.mode === 'builder' || workspace.mode === 'client') q = q.eq('org_id', workspace.orgId)
  if (workspace.mode === 'sub' && workspace.builderOrgId) q = q.eq('org_id', workspace.builderOrgId)
  const { data: jobRows } = await q

  const builderNames = new Map<string, string>()
  for (const o of orgs) builderNames.set(o.org_id, o.name)
  for (const b of buildersAsSub) builderNames.set(b.builder_org_id, b.builder_name)
  for (const c of clientOrgs) builderNames.set(c.org_id, c.name)
  const jobs: PickerJob[] = (jobRows ?? []).map((j) => ({ ...j, builder_name: builderNames.get(j.org_id) ?? null }))

  const { data: sel } = await supabase
    .from('user_job_selection')
    .select('all_jobs,job_ids')
    .eq('user_id', user.id)
    .eq('org_id', selectionKey)
    .maybeSingle()
  const visible = new Set(jobs.map((j) => j.id))
  // Portal users (subs, clients) with no saved choice see all their jobs by default
  const selection = {
    allJobs: sel?.all_jobs ?? (workspace.mode !== 'builder'),
    jobIds: (sel?.job_ids ?? []).filter((id: string) => visible.has(id)),
  }

  return {
    userId: user.id,
    email: user.email,
    profile: profile ?? { first_name: '', last_name: '', email: user.email, phone: null },
    orgs,
    buildersAsSub,
    clientOrgs,
    workspace,
    selectionKey,
    permissions,
    jobs,
    selection,
  }
})

function resolveWorkspace(
  activeId: string | null,
  orgs: OrgMembership[],
  buildersAsSub: BuilderAsSub[],
  clientOrgs: { org_id: string; name: string }[],
): Workspace {
  const builderMember = (id: string | null) => orgs.find((o) => o.org_id === id && o.kind === 'builder')
  const subMember = (id: string | null) => orgs.find((o) => o.org_id === id && o.kind === 'sub')

  const b = builderMember(activeId)
  if (b) return { mode: 'builder', orgId: b.org_id, orgName: b.name, roleName: b.role_name }

  const asSub = buildersAsSub.find((x) => x.builder_org_id === activeId)
  if (asSub) return { mode: 'sub', subOrgId: asSub.sub_org_id, builderOrgId: asSub.builder_org_id, scopeName: asSub.builder_name }

  const s = subMember(activeId)
  if (s) return { mode: 'sub', subOrgId: s.org_id, builderOrgId: null, scopeName: 'All builders' }

  const c = clientOrgs.find((x) => x.org_id === activeId)
  if (c) return { mode: 'client', orgId: c.org_id, orgName: c.name }

  // Fallbacks: first builder membership, then sub, then client
  const firstBuilder = orgs.find((o) => o.kind === 'builder')
  if (firstBuilder) return { mode: 'builder', orgId: firstBuilder.org_id, orgName: firstBuilder.name, roleName: firstBuilder.role_name }
  const firstSub = orgs.find((o) => o.kind === 'sub')
  if (firstSub) return { mode: 'sub', subOrgId: firstSub.org_id, builderOrgId: null, scopeName: 'All builders' }
  const firstClient = clientOrgs[0]
  return { mode: 'client', orgId: firstClient.org_id, orgName: firstClient.name }
}

/** UI-side permission check. The database enforces the same rules. */
export function can(ctx: Pick<AppContext, 'workspace' | 'permissions'>, module: string, verb: Verb = 'view') {
  if (ctx.workspace.mode !== 'builder') return false
  return Boolean(ctx.permissions.modules[module]?.[verb])
}

export function hasAction(ctx: Pick<AppContext, 'workspace' | 'permissions'>, action: string) {
  return ctx.workspace.mode === 'builder' && ctx.permissions.actions.includes(action)
}

/** The jobs currently selected in the picker (all visible jobs when "all" is on). */
export function selectedJobs(ctx: AppContext) {
  if (ctx.selection.allJobs) return ctx.jobs
  const ids = new Set(ctx.selection.jobIds)
  return ctx.jobs.filter((j) => ids.has(j.id))
}

/** Require builder mode with a permission, or send the user to the summary page. */
export async function requireBuilder(module?: string, verb: Verb = 'view') {
  const ctx = await getAppContext()
  if (ctx.workspace.mode !== 'builder') redirect('/summary')
  if (module && !can(ctx, module, verb)) redirect('/summary?denied=' + module)
  return ctx as AppContext & { workspace: Extract<Workspace, { mode: 'builder' }> }
}
