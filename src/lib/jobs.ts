import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { resolveDateRange } from '@/lib/date-range'
import type { AppContext } from '@/lib/context'

export type JobRow = {
  id: string
  org_id: string
  title: string
  status: string
  color: string
  job_type: string | null
  contract_type: string
  street: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  permit_number: string | null
  lot_info: string | null
  square_feet: number | null
  sub_notes: string | null
  projected_start: string | null
  projected_end: string | null
  actual_start: string | null
  actual_end: string | null
  work_days: number[]
  created_at: string
  is_template: boolean
  builder_name: string | null
  managers: { user_id: string; name: string }[]
}

type Sp = Record<string, string | string[] | undefined>
const arr = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v])
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** All jobs in the current workspace scope (RLS limits rows). */
export async function fetchJobs(ctx: AppContext): Promise<JobRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('jobs')
    .select(`id,org_id,title,status,color,job_type,contract_type,street,city,province,postal_code,permit_number,lot_info,
             square_feet,projected_start,projected_end,actual_start,actual_end,work_days,created_at,is_template,
             job_managers(user_id, profiles(first_name,last_name,email)), job_sub_notes(body)`)
    .is('deleted_at', null)
  const ws = ctx.workspace
  if (ws.mode === 'builder' || ws.mode === 'client') q = q.eq('org_id', ws.orgId)
  if (ws.mode === 'sub' && ws.builderOrgId) q = q.eq('org_id', ws.builderOrgId)
  const { data, error } = await q
  if (error) throw error
  const names = new Map(ctx.jobs.map((j) => [j.org_id, j.builder_name]))
  return (data ?? []).map((j) => {
    const { job_managers, job_sub_notes, ...rest } = j as typeof j & {
      job_managers: { user_id: string; profiles: { first_name: string; last_name: string; email: string } | null }[]
      job_sub_notes: { body: string } | null
    }
    return {
      ...rest,
      sub_notes: job_sub_notes?.body || null,
      builder_name: names.get(j.org_id) ?? null,
      managers: (job_managers ?? []).map((m) => ({
        user_id: m.user_id,
        name: m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}`.trim() || m.profiles.email : '',
      })),
    }
  })
}

export const JOB_SORTS = ['title', 'street', 'city', 'province', 'postal_code', 'builder', 'pm', 'status', 'permit', 'lot', 'created'] as const

/** Filter + sort + paginate the jobs list from URL params. */
export function queryJobs(all: JobRow[], sp: Sp, pageSize = 50) {
  const q = (one(sp.q) ?? '').trim().toLowerCase()
  const statuses = arr(sp.status)
  const pms = arr(sp.pm)
  const builders = arr(sp.builder)
  const created = resolveDateRange(one(sp.created), one(sp.created_from), one(sp.created_to))

  const templates = one(sp.templates) === '1'
  let rows = all.filter((j) => {
    if (j.is_template !== templates) return false
    if (q && ![j.title, j.street, j.city, j.permit_number, j.lot_info, j.sub_notes].some((v) => v?.toLowerCase().includes(q))) return false
    if (statuses.length && !statuses.includes(j.status)) return false
    if (builders.length && !builders.includes(j.org_id)) return false
    if (pms.length) {
      const ids = j.managers.map((m) => m.user_id)
      const ok = pms.some((p) => (p === 'unassigned' ? ids.length === 0 : ids.includes(p)))
      if (!ok) return false
    }
    const c = j.created_at.slice(0, 10)
    if (created.from && c < created.from) return false
    if (created.to && c > created.to) return false
    return true
  })

  const sort = (JOB_SORTS as readonly string[]).includes(one(sp.sort) ?? '') ? one(sp.sort)! : 'title'
  const dir = one(sp.dir) === 'desc' ? 'desc' : 'asc'
  const key = (j: JobRow): string => {
    switch (sort) {
      case 'builder': return j.builder_name ?? ''
      case 'pm': return j.managers.map((m) => m.name).join(', ')
      case 'permit': return j.permit_number ?? ''
      case 'lot': return j.lot_info ?? ''
      case 'created': return j.created_at
      default: return String((j as Record<string, unknown>)[sort] ?? '')
    }
  }
  rows = rows.sort((a, b) => key(a).localeCompare(key(b), 'en-CA', { numeric: true }) * (dir === 'asc' ? 1 : -1))

  const total = rows.length
  const page = Math.max(1, Number(one(sp.page)) || 1)
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, sort, dir: dir as 'asc' | 'desc' }
}

/** Internal users of a builder org (for PM pickers and job access). */
export async function fetchInternalUsers(orgId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('org_members')
    .select('user_id,status,all_jobs,title,role_id,roles(name),profiles(first_name,last_name,email)')
    .eq('org_id', orgId)
  return (data ?? []).map((m) => {
    const p = m.profiles as { first_name: string; last_name: string; email: string } | null
    return {
      user_id: m.user_id,
      status: m.status as string,
      all_jobs: m.all_jobs,
      title: m.title,
      role_id: m.role_id,
      role_name: (m.roles as { name: string } | null)?.name ?? '',
      first_name: p?.first_name ?? '',
      last_name: p?.last_name ?? '',
      email: p?.email ?? '',
      name: p ? `${p.first_name} ${p.last_name}`.trim() || p.email : '',
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}
