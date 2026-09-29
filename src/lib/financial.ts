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
