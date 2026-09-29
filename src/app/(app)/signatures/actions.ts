'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppContext } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'
import { parseDecision } from '@/lib/signature'
import { getObjectBytes, putObject, storageKey } from '@/lib/storage'
import { sha256, stampCertificate } from '@/lib/signed-pdf'

const uuid = z.string().uuid()

export async function createSignatureRequest(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const p = z.object({ title: z.string().trim().min(1, 'Give it a title').max(200), message: z.string().trim().max(4000), in_order: z.boolean(),
    signers: z.array(z.string().regex(/^[us]:[0-9a-f-]{36}\|.{1,200}$/)).min(1, 'Pick at least one signer').max(20) })
    .safeParse({ title: fd.get('title'), message: fd.get('message') ?? '', in_order: fd.get('in_order') === 'on', signers: fd.getAll('signer') })
  if (!p.success) return { error: p.error.issues[0].message }
  const supabase = await createClient()
  const { data: file } = await supabase.from('files').select('id,job_id,org_id').eq('id', uuid.parse(fileId)).single()
  if (!file?.job_id) return { error: 'Pick a document on a job.' }
  const { data: req, error } = await supabase.from('signature_requests').insert({ org_id: file.org_id, job_id: file.job_id, file_id: file.id,
    title: p.data.title, message: p.data.message || null, in_order: p.data.in_order }).select('id').single()
  if (error || !req) return { error: /PDF/.test(error?.message ?? '') ? 'Only PDF documents can be signed.' : 'Could not create the request.' }
  const rows = p.data.signers.map((v, i) => {
    const [who, label] = [v.slice(0, v.indexOf('|')), v.slice(v.indexOf('|') + 1)]
    return { request_id: req.id, sort: i + 1, label, user_id: who.startsWith('u:') ? who.slice(2) : null, sub_org_id: who.startsWith('s:') ? who.slice(2) : null }
  })
  const { error: e2 } = await supabase.from('signature_request_signers').insert(rows)
  if (e2) { await supabase.from('signature_requests').delete().eq('id', req.id); return { error: 'One of the signers isn’t on this job.' } }
  redirect(`/signatures/${req.id}`)
}

/** Fingerprint the exact PDF being sent, then notify signers. */
export async function sendSignatureRequest(id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { data: r } = await supabase.from('signature_requests').select('id,file_id,files!signature_requests_file_id_fkey(storage_key)').eq('id', uuid.parse(id)).single()
  const key = (r?.files as { storage_key: string } | null)?.storage_key
  const bytes = key ? await getObjectBytes(key) : null
  if (!bytes) throw new Error('The document could not be read')
  const { error } = await supabase.rpc('send_signature_request', { p_req: id, p_sha256: sha256(bytes) })
  if (error) throw new Error(error.message)
  revalidatePath(`/signatures/${id}`); revalidatePath('/signatures')
}

export async function voidSignatureRequest(id: string) {
  await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('void_signature_request', { p_req: uuid.parse(id) })
  if (error) throw new Error(error.message)
  revalidatePath(`/signatures/${id}`)
}

export async function signDocument(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  const d = await parseDecision(fd)
  if ('error' in d) return { error: d.error }
  const supabase = await createClient()
  const { data: status, error } = await supabase.rpc('sign_document', { ...d.args, p_req: uuid.parse(id), p_decision: d.decision === 'approved' ? 'signed' : 'declined' })
  if (error) return { error: error.message }
  if (status === 'completed') await makeSignedCopy(id, ctx.tz)
  revalidatePath(`/signatures/${id}`); revalidatePath('/signatures')
  return { ok: d.decision === 'approved' ? 'Signed. Thank you.' : 'Declined. The sender has been told.' }
}

/** Server-side: original + certificate page saved next to the original (service role; the request is already complete). */
async function makeSignedCopy(id: string, tz: string) {
  const admin = createAdminClient()
  const { data: r } = await admin.from('signature_requests').select('*, files!signature_requests_file_id_fkey(*), organizations(name)').eq('id', id).single()
  const f = r?.files as { id: string; org_id: string; job_id: string; folder_id: string; name: string; storage_key: string; share_subs: boolean; share_clients: boolean } | null
  if (!r || !f || r.status !== 'completed' || r.signed_file_id) return
  const original = await getObjectBytes(f.storage_key)
  if (!original || sha256(original) !== r.file_sha256) { console.error('signed copy: document changed since it was sent', id); return }
  const { data: signers } = await admin.from('signature_request_signers').select('*').eq('request_id', id).order('sort')
  const bytes = await stampCertificate(original, { title: r.title, company: (r.organizations as { name: string } | null)?.name ?? '', sentAt: r.sent_at!, completedAt: r.completed_at!, hash: r.file_sha256!, tz }, signers ?? [])
  const newId = randomUUID()
  const name = f.name.replace(/\.pdf$/i, '') + ' (signed).pdf'
  const key = storageKey(f.org_id, f.job_id, newId, 1, name)
  await putObject(key, bytes, 'application/pdf')
  const { error } = await admin.from('files').insert({ id: newId, org_id: f.org_id, folder_id: f.folder_id, kind: 'documents', name, mime: 'application/pdf',
    size_bytes: bytes.length, storage_key: key, status: 'ready', share_subs: f.share_subs, share_clients: f.share_clients, uploaded_by: r.created_by ?? undefined })
  if (error) { console.error('signed copy: could not save', error.message); return }
  await admin.rpc('attach_signed_copy', { p_req: id, p_file: newId })
}
