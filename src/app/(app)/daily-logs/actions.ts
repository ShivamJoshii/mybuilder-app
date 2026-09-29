'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import { dailyWeather, geocode, type Weather } from '@/lib/weather'

export type LogFormState = { error?: string; fieldErrors?: Record<string, string> }

/** Weather for a job on a date (called by the form when job/date change). */
export async function weatherFor(jobId: string, date: string): Promise<Weather | null> {
  await getAppContext()
  if (!z.string().uuid().safeParse(jobId).success || !z.string().date().safeParse(date).success) return null
  const supabase = await createClient()
  const { data: job } = await supabase.from('jobs').select('lat,lng,city,province').eq('id', jobId).maybeSingle()
  if (!job) return null
  const pos = job.lat != null && job.lng != null ? { lat: job.lat, lng: job.lng } : await geocode(job.city, job.province)
  if (!pos) return null
  return dailyWeather(pos.lat, pos.lng, date)
}

const schema = z.object({
  job_id: z.string().uuid('Pick a job'),
  log_date: z.string().date('Pick a date'),
  title: z.string().trim().max(50, 'Title is 50 characters max').nullable(),
  notes: z.string().trim().min(1, 'Write what happened on site').max(4000, 'Notes are 4,000 characters max'),
  tag_ids: z.array(z.string().uuid()),
  new_tags: z.array(z.string().trim().min(1).max(40)).max(10),
  include_weather: z.boolean(),
  weather_notes: z.string().max(1000).nullable(),
  include_weather_notes: z.boolean(),
  share_internal: z.boolean(),
  share_subs: z.boolean(),
  share_clients: z.boolean(),
  weather: z.string().nullable(),
})

function parse(fd: FormData) {
  const b = (k: string) => fd.get(k) === 'on'
  const s = (k: string) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v.trim() : null }
  return schema.safeParse({
    job_id: fd.get('job_id'), log_date: fd.get('log_date'), title: s('title'), notes: fd.get('notes') ?? '',
    tag_ids: fd.getAll('tag_ids'), new_tags: String(fd.get('new_tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    include_weather: b('include_weather'), weather_notes: s('weather_notes'), include_weather_notes: b('include_weather_notes'),
    share_internal: fd.has('share_internal') ? b('share_internal') : true, share_subs: b('share_subs'), share_clients: b('share_clients'),
    weather: s('weather'),
  })
}

async function resolveTags(orgId: string | null, ids: string[], names: string[]) {
  if (!orgId || names.length === 0) return ids
  const supabase = await createClient()
  const { data } = await supabase.from('tags')
    .upsert(names.map((name) => ({ org_id: orgId, module: 'daily_logs', name })), { onConflict: 'org_id,module,name' })
    .select('id')
  return [...new Set([...ids, ...(data ?? []).map((t) => t.id)])]
}

function errors(e: z.ZodError) {
  const fe: Record<string, string> = {}
  for (const i of e.issues) fe[String(i.path[0])] ??= i.message
  return { error: 'Check the highlighted fields.', fieldErrors: fe }
}

// Weather is always looked up server side (never trusted from the form)
function payload(d: z.infer<typeof schema>, tagIds: string[], publish: boolean, weather: Weather | null) {
  return {
    job_id: d.job_id, log_date: d.log_date, title: d.title, notes: d.notes, tag_ids: tagIds, weather,
    include_weather: d.include_weather, weather_notes: d.weather_notes, include_weather_notes: d.include_weather_notes,
    share_internal: d.share_internal, share_subs: d.share_subs, share_clients: d.share_clients,
    ...(publish ? { status: 'published' as const } : {}),
  }
}

export async function createLog(_: LogFormState, fd: FormData): Promise<LogFormState> {
  const ctx = await getAppContext()
  const parsed = parse(fd)
  if (!parsed.success) return errors(parsed.error)
  const d = parsed.data
  const builderOrg = ctx.workspace.mode === 'builder' ? ctx.workspace.orgId : null
  const tagIds = await resolveTags(builderOrg, d.tag_ids, d.new_tags)
  const supabase = await createClient()
  const job = ctx.jobs.find((j) => j.id === d.job_id)
  if (!job) return { error: 'Pick a job you have access to.' }
  const publish = fd.get('intent') !== 'draft'
  const { data, error } = await supabase.from('daily_logs')
    .insert({ org_id: job.org_id, ...payload(d, tagIds, publish, d.include_weather ? await weatherFor(d.job_id, d.log_date) : null), status: publish ? 'published' : 'draft' })
    .select('id').single()
  if (error || !data) return { error: /log_date/.test(error?.message ?? '') ? 'Daily logs can’t be dated in the future.' : 'Could not save the daily log.' }
  revalidatePath('/daily-logs')
  redirect(`/daily-logs/${data.id}`)
}

export async function updateLog(id: string, _: LogFormState, fd: FormData): Promise<LogFormState> {
  const ctx = await getAppContext()
  const parsed = parse(fd)
  if (!parsed.success) return errors(parsed.error)
  const d = parsed.data
  const builderOrg = ctx.workspace.mode === 'builder' ? ctx.workspace.orgId : null
  const tagIds = await resolveTags(builderOrg, d.tag_ids, d.new_tags)
  const supabase = await createClient()
  const { data, error } = await supabase.from('daily_logs').update(payload(d, tagIds, fd.get('intent') !== 'draft', d.include_weather ? await weatherFor(d.job_id, d.log_date) : null))
    .eq('id', z.string().uuid().parse(id)).select('id')
  if (error || !data?.length) return { error: 'Could not save the daily log.' }
  revalidatePath('/daily-logs'); revalidatePath(`/daily-logs/${id}`)
  redirect(`/daily-logs/${id}`)
}

export async function deleteLog(id: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('daily_logs').update({ deleted_at: new Date().toISOString() }).eq('id', z.string().uuid().parse(id))
  revalidatePath('/daily-logs')
  redirect('/daily-logs')
}
