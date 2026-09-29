'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import { headObject, signUpload, storageKey, MAX_UPLOAD_BYTES } from '@/lib/storage'
import type { ActionState } from '@/components/kit/action-form'
import type { Json } from '@/lib/supabase/database.types'

const uuid = z.string().uuid()
const PLAN_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const fileSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mime: z.string().refine((m) => PLAN_MIMES.includes(m), 'Upload a PDF or an image'),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES, 'Files can be up to 500 MB'),
})
const pageSchema = z.object({ page: z.number().int().min(1).max(2000), number: z.string().trim().min(1, 'Every sheet needs a number').max(30), title: z.string().trim().max(200), discipline: z.string().trim().max(40) })

/** Plan set upload, step 1: one sheet per page, all pointing at one stored file. */
export async function startPlanSet(input: { jobId: string; file: { name: string; mime: string; size: number }; pages: { page: number; number: string; title: string; discipline: string }[]; shareSubs: boolean; shareClients: boolean }) {
  const ctx = await getAppContext()
  const d = z.object({ jobId: uuid, file: fileSchema, pages: z.array(pageSchema).min(1).max(2000), shareSubs: z.boolean(), shareClients: z.boolean() }).parse(input)
  const job = ctx.jobs.find((j) => j.id === d.jobId)
  if (!job) throw new Error('Job not found')
  const supabase = await createClient()
  const setId = randomUUID()
  const key = storageKey(job.org_id, job.id, setId, 1, d.file.name)
  const sheets = d.pages.map((p) => ({ id: randomUUID(), org_id: job.org_id, job_id: job.id, number: p.number, title: p.title, discipline: p.discipline || null, share_subs: d.shareSubs, share_clients: d.shareClients }))
  const { error } = await supabase.from('plan_sheets').insert(sheets)
  if (error) throw new Error('You can’t add plans to this job')
  const { data: versions, error: e2 } = await supabase.from('plan_sheet_versions').insert(
    sheets.map((s, i) => ({ sheet_id: s.id, version: 1, storage_key: key, mime: d.file.mime, size_bytes: d.file.size, page: d.pages[i].page })),
  ).select('id')
  if (e2 || !versions) throw new Error('Could not create the sheets')
  return { url: await signUpload(key, d.file.mime), key, versionIds: versions.map((v) => v.id) }
}

/** New version of one sheet, step 1. */
export async function startSheetVersion(input: { sheetId: string; file: { name: string; mime: string; size: number }; page: number; note: string }) {
  await getAppContext()
  const d = z.object({ sheetId: uuid, file: fileSchema, page: z.number().int().min(1).max(2000), note: z.string().trim().max(500) }).parse(input)
  const supabase = await createClient()
  const { data: sheet } = await supabase.from('plan_sheets').select('id,org_id,job_id').eq('id', d.sheetId).single()
  if (!sheet) throw new Error('Sheet not found')
  const { data: last } = await supabase.from('plan_sheet_versions').select('version').eq('sheet_id', sheet.id).order('version', { ascending: false }).limit(1).single()
  const version = (last?.version ?? 0) + 1
  const key = storageKey(sheet.org_id, sheet.job_id, sheet.id, version, d.file.name)
  const { data: v, error } = await supabase.from('plan_sheet_versions').insert({
    sheet_id: sheet.id, version, storage_key: key, mime: d.file.mime, size_bytes: d.file.size, page: d.page, note: d.note || null,
  }).select('id').single()
  if (error || !v) throw new Error('You can’t add versions to this sheet')
  return { url: await signUpload(key, d.file.mime), key, versionIds: [v.id] }
}

/** Step 2: bytes are in storage; mark versions ready and move sheets to the new version. */
export async function finishPlanUpload(key: string, versionIds: string[]) {
  await getAppContext()
  const ids = z.array(uuid).min(1).max(2000).parse(versionIds)
  if (!(await headObject(key))) throw new Error('Upload did not complete')
  const supabase = await createClient()
  const { data: vs, error } = await supabase.from('plan_sheet_versions').update({ status: 'ready' }).in('id', ids).eq('storage_key', key).select('sheet_id,version')
  if (error || !vs?.length) throw new Error('Could not save the plans')
  for (const v of vs) if (v.version > 1) await supabase.from('plan_sheets').update({ current_version: v.version }).eq('id', v.sheet_id)
  revalidatePath('/plans')
  return vs.length === 1 ? vs[0].sheet_id : null
}

const sheetSchema = z.object({ number: z.string().trim().min(1, 'Enter a sheet number').max(30), title: z.string().trim().max(200), discipline: z.string().trim().max(40) })

export async function updateSheet(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const p = sheetSchema.safeParse({ number: fd.get('number'), title: fd.get('title') ?? '', discipline: fd.get('discipline') ?? '' })
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.from('plan_sheets').update({
    number: p.data.number, title: p.data.title, discipline: p.data.discipline || null,
    share_subs: fd.get('share_subs') === 'on', share_clients: fd.get('share_clients') === 'on',
  }).eq('id', uuid.parse(id)).select('id')
  if (error || !data?.length) return { error: 'Could not save the sheet.' }
  revalidatePath(`/plans/${id}`); revalidatePath('/plans')
  return { ok: 'Sheet saved.' }
}

export async function deleteSheet(id: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('plan_sheets').update({ deleted_at: new Date().toISOString() }).eq('id', uuid.parse(id))
  revalidatePath('/plans')
  redirect('/plans')
}

const shape = z.object({ id: z.string().max(40), t: z.enum(['pen', 'rect', 'arrow', 'text', 'cloud']), c: z.string().regex(/^#[0-9a-f]{6}$/i), w: z.number().min(0.5).max(40) }).passthrough()

export async function saveMarkup(sheetId: string, version: number, visibility: 'private' | 'team' | 'shared', shapes: unknown) {
  const ctx = await getAppContext()
  const d = z.object({ sheetId: uuid, version: z.number().int().min(1), visibility: z.enum(['private', 'team', 'shared']), shapes: z.array(shape).max(5000) })
    .parse({ sheetId, version, visibility, shapes })
  const supabase = await createClient()
  const { error } = await supabase.from('plan_markups').upsert(
    { sheet_id: d.sheetId, version: d.version, author_id: ctx.userId, visibility: d.visibility, shapes: d.shapes as NonNullable<Json> },
    { onConflict: 'sheet_id,version,author_id' },
  )
  if (error) return { error: d.visibility === 'team' && ctx.workspace.mode !== 'builder' ? 'Only your builder’s team can use “Team”. Pick Private or Shared.' : 'Could not save your markup.' }
  revalidatePath(`/plans/${sheetId}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Specifications
// ---------------------------------------------------------------------------
const specSchema = z.object({
  job_id: uuid, division: z.string().trim().max(80), title: z.string().trim().min(1, 'Enter a title').max(200), body: z.string().max(100000),
  share_subs: z.boolean(), share_clients: z.boolean(),
})
const parseSpec = (fd: FormData) => specSchema.safeParse({
  job_id: fd.get('job_id'), division: fd.get('division') ?? '', title: fd.get('title'), body: fd.get('body') ?? '',
  share_subs: fd.get('share_subs') === 'on', share_clients: fd.get('share_clients') === 'on',
})

export async function createSpec(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const p = parseSpec(fd)
  if (!p.success) return { error: p.error.issues[0].message }
  const job = ctx.jobs.find((j) => j.id === p.data.job_id)
  if (!job) return { error: 'Pick a job you have access to.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('spec_documents').insert({ ...p.data, org_id: job.org_id, division: p.data.division || null }).select('id').single()
  if (error || !data) return { error: 'Could not create the specification.' }
  revalidatePath('/plans')
  redirect(`/plans/specs/${data.id}`)
}

export async function updateSpec(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const p = parseSpec(fd)
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { job_id: _job, ...rest } = p.data
  void _job
  const { data, error } = await supabase.from('spec_documents').update({ ...rest, division: rest.division || null }).eq('id', uuid.parse(id)).select('id')
  if (error || !data?.length) return { error: 'Could not save the specification.' }
  revalidatePath(`/plans/specs/${id}`); revalidatePath('/plans')
  return { ok: 'Specification saved.' }
}

export async function deleteSpec(id: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('spec_documents').update({ deleted_at: new Date().toISOString() }).eq('id', uuid.parse(id))
  revalidatePath('/plans')
  redirect('/plans?tab=specs')
}
