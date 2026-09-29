'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { headObject, signUpload } from '@/lib/storage'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, requireBuilder, hasAction } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'

const blank = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const uuid = z.string().uuid()

async function requireAction(action: string) {
  const ctx = await requireBuilder()
  if (!hasAction(ctx, action)) throw new Error('Not allowed')
  return ctx
}

// ----- my profile -------------------------------------------------------------

export async function updateProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const parsed = z.object({
    first_name: z.string().trim().min(1, 'Enter your first name').max(80),
    last_name: z.string().trim().min(1, 'Enter your last name').max(80),
    phone: z.string().trim().max(40).nullable(),
  }).safeParse({ first_name: fd.get('first_name'), last_name: fd.get('last_name'), phone: blank(fd.get('phone')) })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update(parsed.data).eq('id', ctx.userId)
  if (error) return { error: 'Could not save your profile.' }
  revalidatePath('/', 'layout')
  return { ok: 'Profile saved.' }
}

// ----- company ----------------------------------------------------------------

const postal = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/

export async function updateCompany(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAction('settings.manage')
  const parsed = z.object({
    name: z.string().trim().min(2, 'Enter the company name').max(120),
    legal_name: z.string().max(160).nullable(),
    phone: z.string().max(40).nullable(),
    email: z.string().email('Enter a valid email').nullable(),
    website: z.string().max(200).nullable(),
    street: z.string().max(200).nullable(),
    city: z.string().max(100).nullable(),
    province: z.string().length(2).nullable(),
    postal_code: z.string().regex(postal, 'Use a Canadian postal code like T5J 0N3').nullable(),
    timezone: z.string().max(60),
    gst_number: z.string().regex(/^[0-9]{9} ?RT ?[0-9]{4}$/i, 'GST/HST number looks like 123456789 RT0001').nullable(),
    qst_number: z.string().max(20).nullable(),
  }).safeParse({
    name: fd.get('name'), legal_name: blank(fd.get('legal_name')), phone: blank(fd.get('phone')),
    email: blank(fd.get('email')), website: blank(fd.get('website')), street: blank(fd.get('street')),
    city: blank(fd.get('city')), province: blank(fd.get('province')), postal_code: blank(fd.get('postal_code')),
    timezone: fd.get('timezone') ?? 'America/Edmonton',
    gst_number: blank(fd.get('gst_number')), qst_number: blank(fd.get('qst_number')),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.from('organizations').update({ ...parsed.data, gst_number: parsed.data.gst_number?.toUpperCase().replace(/\s/g, '').replace(/^(\d{9})RT(\d{4})$/, '$1 RT$2') ?? null }).eq('id', ctx.workspace.orgId).select('id')
  if (error || !data?.length) return { error: 'Could not save company details.' }
  revalidatePath('/', 'layout')
  return { ok: 'Company details saved.' }
}

export async function updateClientDefaults(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAction('settings.manage')
  const settings = {
    schedule: z.enum(['none', 'phases', 'all']).parse(fd.get('schedule') ?? 'phases'),
    schedule_days_ahead: z.coerce.number().int().min(0).max(365).parse(fd.get('schedule_days_ahead') ?? 30),
    submit_change_orders: fd.get('submit_change_orders') === 'on',
    submit_warranty_claims: fd.get('submit_warranty_claims') === 'on',
    see_locked_selections: fd.get('see_locked_selections') === 'on',
    job_price_summary: fd.get('job_price_summary') === 'on',
    invoices: fd.get('invoices') === 'on',
    purchase_orders: fd.get('purchase_orders') === 'on',
    budget: fd.get('budget') === 'on',
    pm_contact: fd.get('pm_contact') === 'on',
  }
  const supabase = await createClient()
  const { error } = await supabase.from('client_permission_defaults').upsert({ org_id: ctx.workspace.orgId, settings })
  if (error) return { error: 'Could not save client defaults.' }
  if (fd.get('apply_existing') === 'on') {
    const { data: jobs } = await supabase.from('jobs').select('id').eq('org_id', ctx.workspace.orgId)
    if (jobs?.length) await supabase.from('job_client_permissions').upsert(jobs.map((j) => ({ job_id: j.id, settings })))
  }
  revalidatePath('/settings/company')
  return { ok: 'Client portal defaults saved.' }
}

// ----- internal users ---------------------------------------------------------

export async function inviteUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAction('users.manage')
  const parsed = z.object({ email: z.string().trim().email('Enter a valid email'), role_id: uuid })
    .safeParse({ email: fd.get('email'), role_id: fd.get('role_id') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc('invite_internal_user', { p_org: ctx.workspace.orgId, p_email: parsed.data.email, p_role: parsed.data.role_id })
  if (error) return { error: 'Could not create the invite.' }
  revalidatePath('/settings/users')
  return { ok: `Invite created for ${parsed.data.email}. Copy the link below and send it to them.` }
}

export async function revokeInvite(inviteId: string) {
  await requireAction('users.manage')
  const supabase = await createClient()
  await supabase.from('invites').delete().eq('id', uuid.parse(inviteId))
  revalidatePath('/settings/users')
  revalidatePath('/settings/subs')
}

export async function updateMember(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAction('users.manage')
  const parsed = z.object({
    role_id: uuid,
    status: z.enum(['active', 'inactive', 'archived']),
    all_jobs: z.boolean(),
    title: z.string().max(80).nullable(),
  }).safeParse({ role_id: fd.get('role_id'), status: fd.get('status'), all_jobs: fd.get('all_jobs') === 'on', title: blank(fd.get('title')) })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  if (userId === ctx.userId && parsed.data.status !== 'active') return { error: 'You can’t deactivate yourself.' }
  const supabase = await createClient()
  if (userId === ctx.userId) {
    // Don't let the last owner/admin remove their own admin powers
    const { data: role } = await supabase.from('roles').select('template_key').eq('id', parsed.data.role_id).single()
    if (!['org_owner', 'admin'].includes(role?.template_key ?? '')) {
      const { data: admins } = await supabase.from('org_members').select('user_id, roles!inner(template_key)')
        .eq('org_id', ctx.workspace.orgId).eq('status', 'active').in('roles.template_key', ['org_owner', 'admin'])
      if ((admins ?? []).filter((a) => a.user_id !== userId).length === 0) return { error: 'Keep at least one Org Owner or Admin.' }
    }
  }
  const { data, error } = await supabase.from('org_members').update(parsed.data).eq('org_id', ctx.workspace.orgId).eq('user_id', userId).select('user_id')
  if (error || !data?.length) return { error: 'Could not update this user.' }
  revalidatePath('/settings/users')
  return { ok: 'Saved.' }
}

// ----- roles ------------------------------------------------------------------

export async function cloneRole(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAction('users.manage')
  const parsed = z.object({ role_id: uuid, name: z.string().trim().min(2, 'Name the role').max(60) })
    .safeParse({ role_id: fd.get('role_id'), name: fd.get('name') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('clone_role', { p_role: parsed.data.role_id, p_name: parsed.data.name })
  if (error) return { error: /duplicate|unique/i.test(error.message) ? 'A role with that name already exists.' : 'Could not copy the role.' }
  redirect(`/settings/roles/${data}`)
}

export async function saveRole(roleId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAction('users.manage')
  uuid.parse(roleId)
  const supabase = await createClient()
  const { data: role } = await supabase.from('roles').select('id,is_builtin').eq('id', roleId).single()
  if (!role || role.is_builtin) return { error: 'Built-in roles can’t be changed. Copy it first.' }

  const name = z.string().trim().min(2).max(60).safeParse(fd.get('name'))
  if (!name.success) return { error: 'Name the role (2–60 characters).' }
  const statuses = fd.getAll('allowed_job_statuses').map(String).filter((s) => ['presale', 'open', 'warranty', 'closed'].includes(s))
  if (statuses.length === 0) return { error: 'Pick at least one job status this role can see.' }

  const { data: modules } = await supabase.from('app_modules').select('key')
  const perms = (modules ?? []).map((m) => {
    const k = m.key
    const view = fd.get(`${k}.view`) === 'on'
    return {
      role_id: roleId, module: k, can_view: view,
      can_add: view && fd.get(`${k}.add`) === 'on',
      can_edit: view && fd.get(`${k}.edit`) === 'on',
      can_delete: view && fd.get(`${k}.delete`) === 'on',
      scope: (['all', 'assigned', 'own'].includes(String(fd.get(`${k}.scope`))) ? String(fd.get(`${k}.scope`)) : 'assigned') as 'all' | 'assigned' | 'own',
      see_cost: view && fd.get(`${k}.cost`) === 'on',
      see_price: view && fd.get(`${k}.price`) === 'on',
    }
  })
  const actions = fd.getAll('actions').map(String)

  const { error: e1 } = await supabase.from('roles').update({
    name: name.data, description: String(fd.get('description') ?? '').slice(0, 300),
    allowed_job_statuses: statuses as ('presale' | 'open' | 'warranty' | 'closed')[],
    all_jobs_default: fd.get('all_jobs_default') === 'on',
  }).eq('id', roleId)
  if (e1) return { error: /duplicate|unique/i.test(e1.message) ? 'A role with that name already exists.' : 'Could not save the role.' }
  const { error: e2 } = await supabase.from('role_permissions').upsert(perms)
  if (e2) return { error: 'Could not save permissions.' }
  await supabase.from('role_actions').delete().eq('role_id', roleId)
  if (actions.length) await supabase.from('role_actions').insert(actions.map((action) => ({ role_id: roleId, action })))
  revalidatePath('/', 'layout')
  return { ok: 'Role saved.' }
}

export async function deleteRole(roleId: string) {
  await requireAction('users.manage')
  const supabase = await createClient()
  const { count } = await supabase.from('org_members').select('user_id', { count: 'exact', head: true }).eq('role_id', roleId)
  if ((count ?? 0) > 0) throw new Error('Move users off this role before deleting it')
  await supabase.from('roles').delete().eq('id', uuid.parse(roleId))
  redirect('/settings/roles')
}

// ----- subs and vendors -------------------------------------------------------

export async function addSub(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireBuilder('subs_vendors', 'add')
  const parsed = z.object({
    company_name: z.string().trim().min(2, 'Enter the company name').max(120),
    email: z.string().trim().email('Enter a valid email'),
    trade: z.string().max(80).nullable(),
    first: z.string().max(80).nullable(),
    last: z.string().max(80).nullable(),
    phone: z.string().max(40).nullable(),
  }).safeParse({
    company_name: fd.get('company_name'), email: fd.get('email'), trade: blank(fd.get('trade')),
    first: blank(fd.get('first')), last: blank(fd.get('last')), phone: blank(fd.get('phone')),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc('add_sub_vendor', {
    p_builder: ctx.workspace.orgId, p_company_name: parsed.data.company_name, p_email: parsed.data.email,
    p_trade: parsed.data.trade ?? undefined, p_contact_first: parsed.data.first ?? undefined,
    p_contact_last: parsed.data.last ?? undefined, p_phone: parsed.data.phone ?? undefined,
  })
  if (error) return { error: 'Could not add the sub or vendor.' }
  revalidatePath('/settings/subs')
  return { ok: `${parsed.data.company_name} added. Copy their invite link below.` }
}

export async function setSubStatus(linkId: string, status: 'active' | 'inactive') {
  await requireBuilder('subs_vendors', 'edit')
  const supabase = await createClient()
  await supabase.from('builder_sub_links').update({ status }).eq('id', uuid.parse(linkId))
  revalidatePath('/settings/subs')
}

export async function updateSubLink(linkId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireBuilder('subs_vendors', 'edit')
  const supabase = await createClient()
  const { error } = await supabase.from('builder_sub_links').update({
    trade: blank(fd.get('trade')), company_name: String(fd.get('company_name') ?? '').trim() || undefined,
    primary_email: blank(fd.get('primary_email')), business_phone: blank(fd.get('business_phone')),
  }).eq('id', uuid.parse(linkId))
  if (error) return { error: 'Could not save.' }
  revalidatePath('/settings/subs')
  return { ok: 'Saved.' }
}

export async function updateMySubProfile(linkId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const profile: Record<string, string | boolean> = {}
  for (const k of ['company_name', 'primary_contact_first', 'primary_contact_last', 'business_phone', 'fax', 'cell_phone', 'primary_email', 'street', 'city', 'province', 'postal_code']) {
    const v = fd.get(k)
    if (typeof v === 'string') profile[k] = v.trim()
  }
  profile.sms_opt_in = fd.get('sms_opt_in') === 'on'
  if (profile.primary_email && !z.string().email().safeParse(profile.primary_email).success) return { error: 'Enter a valid email.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_my_sub_profile', { p_link: uuid.parse(linkId), p_profile: profile })
  if (error) return { error: 'Could not save your company profile.' }
  revalidatePath('/settings/sub-profile')
  return { ok: 'Company profile saved.' }
}

// ----- cost codes -------------------------------------------------------------

export async function addCostCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireBuilder('cost_codes', 'add')
  const name = z.string().trim().min(2, 'Name the category').max(80).safeParse(fd.get('name'))
  if (!name.success) return { error: name.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('cost_categories').insert({ org_id: ctx.workspace.orgId, name: name.data, sort: 1000 })
  if (error) return { error: /duplicate|unique/i.test(error.message) ? 'That category already exists.' : 'Could not add the category.' }
  revalidatePath('/settings/cost-codes')
  return { ok: 'Category added.' }
}

export async function addCostCode(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireBuilder('cost_codes', 'add')
  const parsed = z.object({
    category_id: uuid,
    code: z.string().trim().min(1, 'Enter a code').max(20),
    title: z.string().trim().min(2, 'Enter a title').max(120),
    is_labor: z.boolean(),
  }).safeParse({ category_id: fd.get('category_id'), code: fd.get('code'), title: fd.get('title'), is_labor: fd.get('is_labor') === 'on' })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('cost_codes').insert({ org_id: ctx.workspace.orgId, ...parsed.data, sort: 1000 })
  if (error) return { error: /duplicate|unique/i.test(error.message) ? `Code ${parsed.data.code} already exists.` : 'Could not add the cost code.' }
  revalidatePath('/settings/cost-codes')
  return { ok: `${parsed.data.code} added.` }
}

export async function toggleCostCode(id: string, active: boolean) {
  await requireBuilder('cost_codes', 'edit')
  const supabase = await createClient()
  await supabase.from('cost_codes').update({ is_active: active }).eq('id', uuid.parse(id))
  revalidatePath('/settings/cost-codes')
}

// ----- custom fields ----------------------------------------------------------

export async function addCustomField(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAction('settings.manage')
  const parsed = z.object({
    module: z.string().min(1),
    label: z.string().trim().min(2, 'Enter a label').max(60),
    data_type: z.enum(['text', 'long_text', 'number', 'currency', 'date', 'boolean', 'single_select', 'multi_select', 'file', 'hyperlink']),
    options: z.array(z.string().trim().min(1)).max(100),
    tooltip: z.string().max(200).nullable(),
  }).safeParse({
    module: fd.get('module'), label: fd.get('label'), data_type: fd.get('data_type'),
    options: String(fd.get('options') ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
    tooltip: blank(fd.get('tooltip')),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  if (['single_select', 'multi_select'].includes(parsed.data.data_type) && parsed.data.options.length < 2) {
    return { error: 'Add at least two options, one per line.' }
  }
  const key = parsed.data.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 40) || 'field'
  const supabase = await createClient()
  const { error } = await supabase.from('custom_field_defs').insert({
    org_id: ctx.workspace.orgId, module: parsed.data.module, key, label: parsed.data.label,
    data_type: parsed.data.data_type, options: parsed.data.options, tooltip: parsed.data.tooltip,
    is_required: fd.get('is_required') === 'on', is_filterable: fd.get('is_filterable') === 'on',
    visible_to_subs: fd.get('visible_to_subs') === 'on', visible_to_clients: fd.get('visible_to_clients') === 'on',
  })
  if (error) return { error: /duplicate|unique/i.test(error.message) ? 'A field with that name already exists on this module.' : 'Could not add the field.' }
  revalidatePath('/settings/custom-fields')
  return { ok: `${parsed.data.label} added.` }
}

export async function toggleCustomField(id: string, active: boolean) {
  await requireAction('settings.manage')
  const supabase = await createClient()
  await supabase.from('custom_field_defs').update({ is_active: active }).eq('id', uuid.parse(id))
  revalidatePath('/settings/custom-fields')
}

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

export async function startLogoUpload(mime: string, size: number) {
  const ctx = await requireAction('settings.manage')
  if (!LOGO_TYPES.includes(mime)) throw new Error('Use a PNG, JPG, WebP or SVG image')
  if (size > 2 * 1024 * 1024) throw new Error('Logos can be up to 2 MB')
  const key = `${ctx.workspace.orgId}/branding/logo-${Date.now()}`
  return { key, url: await signUpload(key, mime) }
}

export async function finishLogoUpload(key: string) {
  const ctx = await requireAction('settings.manage')
  if (!key.startsWith(`${ctx.workspace.orgId}/branding/`) || !(await headObject(key))) throw new Error('Upload did not complete')
  const supabase = await createClient()
  await supabase.from('organizations').update({ logo_url: `storage:${key}` }).eq('id', ctx.workspace.orgId)
  revalidatePath('/', 'layout')
}

export async function removeLogo() {
  const ctx = await requireAction('settings.manage')
  const supabase = await createClient()
  await supabase.from('organizations').update({ logo_url: null }).eq('id', ctx.workspace.orgId)
  revalidatePath('/', 'layout')
}
