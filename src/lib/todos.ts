import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { QRow } from '@/components/kit/query-builder'
import { forJobs, inChunks } from '@/lib/job-filter'
import { getAppContext } from '@/lib/context'

export type TodoRow = {
  id: string
  job_id: string
  title: string
  notes: string | null
  priority: 'low' | 'medium' | 'high'
  due_at: string | null
  has_due_time: boolean
  completed_at: string | null
  created_at: string
  updated_at: string
  created_by: string
  creator: string
  assignees: { key: string; label: string; user_id: string | null; sub_org_id: string | null }[]
  checklist: { total: number; done: number }
}

type Profile = { first_name: string; last_name: string; email: string } | null
const nm = (p: Profile) => (p ? `${p.first_name} ${p.last_name}`.trim() || p.email : '')

export async function fetchTodos(jobIds: string[]): Promise<TodoRow[]> {
  const ctx = await getAppContext()
  if (jobIds.length === 0) return []
  const supabase = await createClient()
  const { data } = await forJobs(supabase
    .from('todos')
    .select(`id,job_id,title,notes,priority,due_at,has_due_time,completed_at,created_at,updated_at,created_by,
             creator:profiles!todos_created_by_fkey(first_name,last_name,email),
             todo_assignees(user_id,sub_org_id,profiles(first_name,last_name,email),organizations(name)),
             todo_checklist(done_at)`)
    , ctx, jobIds)
    .is('deleted_at', null)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(1000)
  return (data ?? []).map((t) => ({
    id: t.id, job_id: t.job_id, title: t.title, notes: t.notes, priority: t.priority, due_at: t.due_at,
    has_due_time: t.has_due_time, completed_at: t.completed_at, created_at: t.created_at, updated_at: t.updated_at,
    created_by: t.created_by,
    creator: nm(t.creator as Profile),
    assignees: ((t.todo_assignees ?? []) as { user_id: string | null; sub_org_id: string | null; profiles: Profile; organizations: { name: string } | null }[])
      .map((a) => ({
        key: a.user_id ?? a.sub_org_id!, user_id: a.user_id, sub_org_id: a.sub_org_id,
        label: a.user_id ? nm(a.profiles) : a.organizations?.name ?? 'Sub',
      })),
    checklist: {
      total: (t.todo_checklist ?? []).length,
      done: ((t.todo_checklist ?? []) as { done_at: string | null }[]).filter((c) => c.done_at).length,
    },
  }))
}

/** Apply query-builder rows (AND). `me` = current user id, `mySubOrgs` = sub orgs the user belongs to. */
export function applyTodoQuery(rows: TodoRow[], q: QRow[], me: string, mySubOrgs: string[]) {
  const mine = (t: TodoRow) => t.assignees.some((a) => a.user_id === me || (a.sub_org_id && mySubOrgs.includes(a.sub_org_id)))
  return rows.filter((t) => q.every((c) => {
    if (c.value === '') return true
    const neg = c.op === 'not'
    let hit: boolean
    switch (c.field) {
      case 'title': hit = c.op === 'is' ? t.title.toLowerCase() === c.value.toLowerCase() : t.title.toLowerCase().includes(c.value.toLowerCase()); break
      case 'assignee': hit = c.value === 'me' ? mine(t) : c.value === 'none' ? t.assignees.length === 0 : t.assignees.some((a) => a.key === c.value); break
      case 'status': hit = c.value === 'completed' ? Boolean(t.completed_at) : c.value === 'overdue' ? !t.completed_at && Boolean(t.due_at && t.due_at < new Date().toISOString()) : !t.completed_at; break
      case 'priority': hit = t.priority === c.value; break
      case 'created_by': hit = c.value === 'me' ? t.created_by === me : t.created_by === c.value; break
      case 'due': {
        const d = t.due_at?.slice(0, 10)
        if (!d) return false
        return c.op === 'before' ? d < c.value : c.op === 'after' ? d > c.value : d === c.value
      }
      case 'modified': {
        const d = t.updated_at.slice(0, 10)
        return c.op === 'before' ? d < c.value : c.op === 'after' ? d > c.value : d === c.value
      }
      default: hit = true
    }
    return neg ? !hit : hit
  }))
}

/** People who can be assigned on each job: internal users, subs on the job, invited clients. */
export async function fetchAssignable(orgId: string, jobIds: string[]) {
  const supabase = await createClient()
  const [{ data: members }, { data: subs }, { data: clients }, { data: links }] = await Promise.all([
    supabase.from('org_members').select('user_id,profiles(first_name,last_name,email)').eq('org_id', orgId).eq('status', 'active'),
    inChunks(jobIds, (c) => supabase.from('job_subs').select('job_id,sub_org_id').in('job_id', c)),
    inChunks(jobIds, (c) => supabase.from('job_clients').select('job_id,user_id,first_name,last_name').in('job_id', c).not('user_id', 'is', null)),
    supabase.from('builder_sub_links').select('sub_org_id,company_name').eq('builder_org_id', orgId),
  ])
  const company = new Map((links ?? []).map((l) => [l.sub_org_id, l.company_name]))
  const internal = (members ?? []).map((m) => ({ value: `u:${m.user_id}`, label: nm(m.profiles as Profile), group: 'Team' }))
  const byJob: Record<string, { value: string; label: string; group: string }[]> = {}
  for (const j of jobIds) byJob[j] = [...internal]
  for (const s of subs ?? []) byJob[s.job_id]?.push({ value: `s:${s.sub_org_id}`, label: company.get(s.sub_org_id) ?? 'Sub', group: 'Subs and vendors' })
  for (const c of clients ?? []) byJob[c.job_id]?.push({ value: `u:${c.user_id}`, label: `${c.first_name} ${c.last_name}`.trim(), group: 'Clients' })
  return byJob
}
