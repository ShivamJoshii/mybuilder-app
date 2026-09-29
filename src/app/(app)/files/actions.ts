'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, requireBuilder } from '@/lib/context'
import { headObject, signUpload, storageKey, MAX_UPLOAD_BYTES } from '@/lib/storage'
import type { ActionState } from '@/components/kit/action-form'

const uuid = z.string().uuid()
const PATHS = ['/documents', '/photos', '/videos']
const revalidate = () => PATHS.forEach((p) => revalidatePath(p))

export async function createFolder(kind: 'documents' | 'photos' | 'videos', jobId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireBuilder('files', 'add')
  const name = z.string().trim().min(1, 'Name the folder').max(120).safeParse(fd.get('name'))
  if (!name.success) return { error: name.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('file_folders').insert({
    org_id: ctx.workspace.orgId, job_id: jobId, kind, name: name.data,
    share_subs: fd.get('share_subs') === 'on', share_clients: fd.get('share_clients') === 'on',
  })
  if (error) return { error: 'Could not create the folder.' }
  revalidate()
  return { ok: `${name.data} created.` }
}

export async function setFolderSharing(folderId: string, subs: boolean, clients: boolean, applyToFiles: boolean) {
  await requireBuilder('files', 'edit')
  const supabase = await createClient()
  await supabase.from('file_folders').update({ share_subs: subs, share_clients: clients }).eq('id', uuid.parse(folderId))
  if (applyToFiles) await supabase.from('files').update({ share_subs: subs, share_clients: clients }).eq('folder_id', folderId).is('deleted_at', null)
  revalidate()
}

/** Step 1 of an upload: create the row and hand back a signed PUT URL. */
export async function startUpload(input: { folderId: string; name: string; mime: string; size: number; shareSubs?: boolean; shareClients?: boolean; replaceFileId?: string }) {
  const ctx = await getAppContext()
  const d = z.object({
    folderId: uuid, name: z.string().trim().min(1).max(255), mime: z.string().max(200), size: z.number().int().min(0).max(MAX_UPLOAD_BYTES, 'Files can be up to 500 MB'),
    shareSubs: z.boolean().optional(), shareClients: z.boolean().optional(), replaceFileId: uuid.optional(),
  }).parse(input)
  const supabase = await createClient()
  const { data: folder } = await supabase.from('file_folders').select('id,org_id,job_id,kind').eq('id', d.folderId).single()
  if (!folder) throw new Error('Folder not found')
  const mime = d.mime || 'application/octet-stream'

  if (d.replaceFileId) {
    // New version of an existing file
    const { data: f } = await supabase.from('files').select('id,version,storage_key,size_bytes,mime').eq('id', d.replaceFileId).single()
    if (!f) throw new Error('File not found')
    const version = f.version + 1
    const key = storageKey(folder.org_id, folder.job_id, f.id, version, d.name)
    await supabase.from('file_versions').insert({ file_id: f.id, version: f.version, storage_key: f.storage_key, size_bytes: f.size_bytes, mime: f.mime, uploaded_by: ctx.userId })
    return { fileId: f.id, version, key, url: await signUpload(key, mime) }
  }

  const id = randomUUID()
  const key = storageKey(folder.org_id, folder.job_id, id, 1, d.name)
  const { error } = await supabase.from('files').insert({
    id, org_id: folder.org_id, folder_id: folder.id, kind: folder.kind, name: d.name, mime, size_bytes: d.size, storage_key: key,
    share_subs: d.shareSubs ?? false, share_clients: d.shareClients ?? false,
  })
  if (error) throw new Error('You can’t upload to this folder')
  return { fileId: id, version: 1, key, url: await signUpload(key, mime) }
}

/** Step 2: confirm the bytes arrived, then mark the file ready. */
export async function finishUpload(fileId: string, version: number, key: string, name: string) {
  await getAppContext()
  const head = await headObject(key)
  if (!head) throw new Error('Upload did not complete')
  const supabase = await createClient()
  const patch = version > 1
    ? { version, storage_key: key, size_bytes: head.size, mime: head.mime, name, status: 'ready' as const }
    : { size_bytes: head.size, mime: head.mime, status: 'ready' as const }
  const { error } = await supabase.from('files').update(patch).eq('id', uuid.parse(fileId))
  if (error) throw new Error('Could not save the file')
  revalidate()
}

export async function setFileSharing(fileId: string, subs: boolean, clients: boolean) {
  await requireBuilder('files', 'edit')
  const supabase = await createClient()
  await supabase.from('files').update({ share_subs: subs, share_clients: clients }).eq('id', uuid.parse(fileId))
  revalidate()
}

export async function renameFile(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const name = z.string().trim().min(1).max(255).safeParse(fd.get('name'))
  if (!name.success) return { error: 'Enter a file name.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('files').update({ name: name.data }).eq('id', fileId).select('id')
  if (error || !data?.length) return { error: 'Could not rename the file.' }
  revalidate()
  return { ok: 'Renamed.' }
}

export async function trashFiles(ids: string[]) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('files').update({ deleted_at: new Date().toISOString() }).in('id', z.array(uuid).max(500).parse(ids))
  revalidate()
}

export async function restoreFile(id: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('files').update({ deleted_at: null }).eq('id', uuid.parse(id))
  revalidate()
}

export async function createShareLink(fileId: string) {
  await getAppContext()
  const supabase = await createClient()
  const { data: existing } = await supabase.from('file_share_links').select('token').eq('file_id', fileId).is('revoked_at', null).limit(1).maybeSingle()
  if (existing) return `${process.env.NEXT_PUBLIC_SITE_URL}/s/${existing.token}`
  const { data, error } = await supabase.from('file_share_links').insert({ file_id: uuid.parse(fileId) }).select('token').single()
  if (error || !data) throw new Error('Only your team can create public links')
  return `${process.env.NEXT_PUBLIC_SITE_URL}/s/${data.token}`
}

export async function revokeShareLinks(fileId: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('file_share_links').update({ revoked_at: new Date().toISOString() }).eq('file_id', fileId).is('revoked_at', null)
  revalidate()
}

export async function shareQr(url: string) {
  const QR = await import('qrcode')
  return QR.toDataURL(url, { margin: 1, width: 240 })
}
