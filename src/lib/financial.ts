import 'server-only'
import { createClient } from '@/lib/supabase/server'

/** Active subs/vendors linked to a builder (for pickers). */
export async function linkedSubs(builderOrgId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('builder_sub_links').select('sub_org_id,company_name,trade').eq('builder_org_id', builderOrgId).eq('status', 'active').order('company_name')
  return data ?? []
}

export async function costCodes(orgId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('cost_codes').select('id,code,title').eq('org_id', orgId).eq('is_active', true).order('code')
  return data ?? []
}

/** Codes offered on the time clock: the labour codes, or every code if none are marked as labour. */
export async function labourCodes(orgId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('cost_codes').select('id,code,title,is_labor').eq('org_id', orgId).eq('is_active', true).order('code')
  const labour = (data ?? []).filter((c) => c.is_labor)
  return (labour.length ? labour : data ?? []).map(({ id, code, title }) => ({ id, code, title }))
}

/** Team members and linked subs, as "u:<id>" / "s:<id>" options. */
export async function teamAndSubs(orgId: string) {
  const supabase = await createClient()
  const [{ data: members }, subs] = await Promise.all([
    supabase.from('org_members').select('user_id,profiles(first_name,last_name,email)').eq('org_id', orgId).eq('status', 'active'),
    linkedSubs(orgId),
  ])
  type P = { first_name: string; last_name: string; email: string } | null
  return [
    ...(members ?? []).map((m) => { const p = m.profiles as P; return { value: `u:${m.user_id}`, label: p ? `${p.first_name} ${p.last_name}`.trim() || p.email : 'Team member', group: 'Team' } }),
    ...subs.map((s) => ({ value: `s:${s.sub_org_id}`, label: s.company_name, group: 'Subs and vendors' })),
  ]
}
