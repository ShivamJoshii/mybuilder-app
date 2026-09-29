import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type Lookup = { id: string; name: string }
export type Status = Lookup & { category: 'open' | 'won' | 'lost' | 'inactive'; color: string; sort: number; is_system: boolean }

export async function fetchLookups(orgId: string) {
  const supabase = await createClient()
  const [s, src, pt, lr, users] = await Promise.all([
    supabase.from('lead_statuses').select('id,name,category,color,sort,is_system').eq('org_id', orgId).order('sort'),
    supabase.from('lead_sources').select('id,name').eq('org_id', orgId).order('sort'),
    supabase.from('project_types').select('id,name').eq('org_id', orgId).order('sort'),
    supabase.from('lost_reasons').select('id,name').eq('org_id', orgId).order('sort'),
    supabase.from('org_members').select('user_id,role_id,profiles(first_name,last_name,email)').eq('org_id', orgId).eq('status', 'active'),
  ])
  type U = { user_id: string; role_id: string | null; profiles: { first_name: string; last_name: string; email: string } | null }
  const members = (users.data ?? []) as unknown as U[]
  const roleIds = [...new Set(members.map((m) => m.role_id).filter(Boolean))] as string[]
  const { data: perms } = roleIds.length
    ? await supabase.from('role_permissions').select('role_id').eq('module', 'leads').eq('can_view', true).in('role_id', roleIds)
    : { data: [] }
  const sellers = new Set((perms ?? []).map((p) => p.role_id))
  const salespeople = members
    .filter((u) => u.role_id && sellers.has(u.role_id))
    .map((u) => ({ id: u.user_id, name: u.profiles ? `${u.profiles.first_name} ${u.profiles.last_name}`.trim() || u.profiles.email : '' }))
  return {
    statuses: (s.data ?? []) as Status[], sources: (src.data ?? []) as Lookup[], types: (pt.data ?? []) as Lookup[],
    lostReasons: (lr.data ?? []) as Lookup[], salespeople,
  }
}

export type LeadRow = {
  id: string; title: string; status_id: string; contact_first: string; contact_last: string; contact_email: string | null; contact_phone: string | null
  site_street: string | null; site_city: string | null; confidence: number | null; est_revenue_min: number | null; est_revenue_max: number | null
  projected_sale_date: string | null; source_ids: string[]; project_type_ids: string[]; created_at: string; status_changed_at: string
  converted_job_id: string | null; salespeople: string[]; last_activity: string | null
}

export async function fetchLeads(orgId: string): Promise<LeadRow[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('leads')
    .select(`id,title,status_id,contact_first,contact_last,contact_email,contact_phone,site_street,site_city,confidence,est_revenue_min,est_revenue_max,
             projected_sale_date,source_ids,project_type_ids,created_at,status_changed_at,converted_job_id,lead_salespeople(user_id),lead_activities(activity_date)`)
    .eq('org_id', orgId).is('deleted_at', null).order('created_at', { ascending: false }).limit(2000)
  return (data ?? []).map(({ lead_salespeople, lead_activities, ...l }) => ({
    ...l,
    est_revenue_min: l.est_revenue_min == null ? null : Number(l.est_revenue_min),
    est_revenue_max: l.est_revenue_max == null ? null : Number(l.est_revenue_max),
    salespeople: (lead_salespeople ?? []).map((s: { user_id: string }) => s.user_id),
    last_activity: (lead_activities ?? []).map((a: { activity_date: string }) => a.activity_date).sort().at(-1) ?? null,
  }))
}

export const ACTIVITY_TYPES = [
  { value: 'call', label: 'Phone call' }, { value: 'email', label: 'Email' }, { value: 'meeting', label: 'Meeting' },
  { value: 'follow_up', label: 'Follow-up' }, { value: 'sms', label: 'Text message' }, { value: 'note', label: 'Note' },
  { value: 'website_form', label: 'Website form' },
] as const

export function ageDays(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

export function revenue(min: number | null, max: number | null) {
  const f = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)
  if (min == null && max == null) return ''
  if (min != null && max != null && min !== max) return `${f(min)}–${f(max)}`
  return f((max ?? min)!)
}
