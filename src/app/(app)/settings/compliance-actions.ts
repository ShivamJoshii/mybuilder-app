'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, hasAction } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'
import { CERT_KINDS, REQUIRABLE } from '@/lib/compliance'

const uuid = z.string().uuid()
const date = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).transform((v) => v || null)
const certSchema = z.object({
  kind: z.enum(Object.keys(CERT_KINDS) as [keyof typeof CERT_KINDS]),
  label: z.string().trim().max(120), number: z.string().trim().max(120), provider: z.string().trim().max(200),
  coverage: z.union([z.literal(''), z.coerce.number().min(0).max(1e11)]),
  effective_on: date, expires_on: date, notes: z.string().trim().max(2000),
}).refine((d) => !d.effective_on || !d.expires_on || d.expires_on >= d.effective_on, { message: 'Expiry must be after the effective date' })

export async function addCertificate(builderId: string, subId: string, path: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const p = certSchema.safeParse({
    kind: fd.get('kind'), label: fd.get('label') ?? '', number: fd.get('number') ?? '', provider: fd.get('provider') ?? '',
    coverage: String(fd.get('coverage') ?? '').replace(/[$,\s]/g, ''), effective_on: fd.get('effective_on') ?? '', expires_on: fd.get('expires_on') ?? '', notes: fd.get('notes') ?? '',
  })
  if (!p.success) return { error: p.error.issues[0].message }
  if (p.data.kind !== 'other' && !p.data.expires_on && p.data.kind !== 'business_licence') return { error: 'Enter the expiry date.' }
  const supabase = await createClient()
  const d = p.data
  const { error } = await supabase.from('sub_certificates').insert({
    builder_org_id: uuid.parse(builderId), sub_org_id: uuid.parse(subId), kind: d.kind, label: d.label || null, number: d.number || null,
    provider: d.provider || null, coverage: d.coverage === '' ? null : d.coverage, effective_on: d.effective_on, expires_on: d.expires_on, notes: d.notes || null,
  })
  if (error) return { error: 'Could not save the certificate.' }
  revalidatePath(path)
  return { ok: `${CERT_KINDS[d.kind]} saved.` }
}

export async function deleteCertificate(id: string, path: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('sub_certificates').delete().eq('id', uuid.parse(id))
  revalidatePath(path)
}

/** Builder confirms the document matches (only verified certificates count toward compliance). */
export async function verifyCertificate(id: string, verified: boolean, path: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('sub_certificates').update({ verified_at: verified ? new Date().toISOString() : null }).eq('id', uuid.parse(id))
  revalidatePath(path)
}

export async function attachCertificateFile(id: string, fileIds: string[], path: string) {
  await getAppContext()
  const fileId = uuid.parse(fileIds[0])
  const supabase = await createClient()
  const { error } = await supabase.from('sub_certificates').update({ file_id: fileId }).eq('id', uuid.parse(id))
  if (error) throw new Error('Could not attach the document')
  revalidatePath(path)
}

export async function saveComplianceRules(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getAppContext()
  if (ctx.workspace.mode !== 'builder' || !hasAction(ctx, 'settings.manage')) return { error: 'Only company admins can change these rules.' }
  const req = fd.getAll('required').map(String).filter((k): k is (typeof REQUIRABLE)[number] => (REQUIRABLE as string[]).includes(k))
  const supabase = await createClient()
  const { error } = await supabase.from('organizations').update({ compliance_required: req, compliance_blocks_payment: fd.get('block') === 'on' }).eq('id', ctx.workspace.orgId)
  if (error) return { error: 'Could not save.' }
  revalidatePath('/settings/subs')
  return { ok: 'Compliance rules saved.' }
}
