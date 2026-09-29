import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Calendar, Exception } from './calendar'

export type SchedItem = {
  id: string
  job_id: string
  phase_id: string | null
  title: string
  color: string | null
  start_date: string
  duration: number
  end_date: string
  is_hourly: boolean
  start_time: string | null
  end_time: string | null
  progress: number
  completed_at: string | null
  show_on_gantt: boolean
  show_subs: boolean
  show_client: boolean
  notes_all: string | null
  reminder_days: number | null
  assignees: { id: string; user_id: string | null; sub_org_id: string | null; label: string; status: 'pending' | 'confirmed' | 'declined' }[]
}

export type SchedLink = { predecessor_id: string; successor_id: string; type: 'FS' | 'SS'; lag_days: number }

type P = { first_name: string; last_name: string; email: string } | null

export async function fetchSchedule(jobIds: string[]) {
  if (jobIds.length === 0) return { items: [] as SchedItem[], links: [] as SchedLink[], online: new Map<string, boolean>(), phases: [] as { id: string; job_id: string; name: string; color: string }[] }
  const supabase = await createClient()
  const [{ data: items }, { data: settings }, { data: phases }] = await Promise.all([
    supabase.from('schedule_items')
      .select(`id,job_id,phase_id,title,color,start_date,duration,end_date,is_hourly,start_time,end_time,progress,completed_at,
               show_on_gantt,show_subs,show_client,notes_all,reminder_days,
               schedule_assignees(id,user_id,sub_org_id,status,profiles!schedule_assignees_user_id_fkey(first_name,last_name,email),organizations(name))`)
      .in('job_id', jobIds).is('deleted_at', null).order('start_date').order('title'),
    supabase.from('job_schedule_settings').select('job_id,is_online').in('job_id', jobIds),
    supabase.from('schedule_phases').select('id,job_id,name,color').in('job_id', jobIds).order('sort'),
  ])
  const ids = (items ?? []).map((i) => i.id)
  const { data: links } = ids.length
    ? await supabase.from('schedule_links').select('predecessor_id,successor_id,type,lag_days').in('successor_id', ids)
    : { data: [] }
  return {
    items: (items ?? []).map((i) => ({
      ...i,
      assignees: ((i.schedule_assignees ?? []) as { id: string; user_id: string | null; sub_org_id: string | null; status: 'pending' | 'confirmed' | 'declined'; profiles: P; organizations: { name: string } | null }[])
        .map((a) => ({
          id: a.id, user_id: a.user_id, sub_org_id: a.sub_org_id, status: a.status,
          label: a.user_id ? (a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}`.trim() || a.profiles.email : '') : a.organizations?.name ?? 'Sub',
        })),
    })) as SchedItem[],
    links: (links ?? []) as SchedLink[],
    online: new Map((settings ?? []).map((s) => [s.job_id, s.is_online])),
    phases: phases ?? [],
  }
}

/** Workday calendar for a job: its work days + company-wide and job exceptions. */
export async function fetchCalendar(jobId: string): Promise<Calendar> {
  const supabase = await createClient()
  const { data: job } = await supabase.from('jobs').select('org_id,work_days').eq('id', jobId).single()
  const { data: ex } = await supabase.from('workday_exceptions').select('type,start_date,end_date,repeat_annually,job_id')
    .eq('org_id', job!.org_id)
  return {
    workDays: job?.work_days ?? [1, 2, 3, 4, 5],
    exceptions: ((ex ?? []) as (Exception & { job_id: string | null })[]).filter((e) => !e.job_id || e.job_id === jobId),
  }
}

/** Audience notes the caller may read (RLS filters by audience). */
export async function fetchItemNotes(itemId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('schedule_item_notes').select('audience,body').eq('item_id', itemId)
  const m = new Map((data ?? []).map((n) => [n.audience, n.body]))
  return { notes_internal: m.get('internal') ?? null, notes_sub: m.get('sub') ?? null, notes_client: m.get('client') ?? null }
}
