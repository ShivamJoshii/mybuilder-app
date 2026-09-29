'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireBuilder, hasAction } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'

const TABLES = { status: 'lead_statuses', source: 'lead_sources', type: 'project_types', lost: 'lost_reasons' } as const

async function guard() {
  const ctx = await requireBuilder()
  if (!hasAction(ctx, 'settings.manage')) throw new Error('Not allowed')
  return ctx
}

export async function addListItem(kind: keyof typeof TABLES, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await guard()
  const name = z.string().trim().min(1).max(40).safeParse(fd.get('name'))
  if (!name.success) return { error: 'Enter a name (up to 40 characters).' }
  const supabase = await createClient()
  const row: Record<string, unknown> = { org_id: ctx.workspace.orgId, name: name.data, sort: 500 }
  if (kind === 'status') { row.category = 'open'; row.color = String(fd.get('color') || '#64748b') }
  const { error } = await supabase.from(TABLES[kind]).insert(row as never)
  if (error) return { error: /duplicate|unique/i.test(error.message) ? 'That already exists.' : 'Could not add it.' }
  revalidatePath('/settings/sales')
  return { ok: `${name.data} added.` }
}

export async function renameListItem(kind: keyof typeof TABLES, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await guard()
  const name = z.string().trim().min(1).max(40).safeParse(fd.get('name'))
  if (!name.success) return { error: 'Enter a name.' }
  const supabase = await createClient()
  const { error } = await supabase.from(TABLES[kind]).update({ name: name.data } as never).eq('id', id)
  if (error) return { error: 'Could not rename it.' }
  revalidatePath('/settings/sales')
  return { ok: 'Saved.' }
}

export async function deleteListItem(kind: keyof typeof TABLES, id: string) {
  await guard()
  const supabase = await createClient()
  const { error } = await supabase.from(TABLES[kind]).delete().eq('id', id)
  if (error) throw new Error(kind === 'status' ? 'Statuses in use, or Sold/Lost, can’t be deleted' : 'Could not delete it')
  revalidatePath('/settings/sales')
}

export async function addForm(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await guard()
  const name = z.string().trim().min(1).max(60).safeParse(fd.get('name'))
  if (!name.success) return { error: 'Name the form.' }
  const supabase = await createClient()
  const src = fd.get('default_source_id')
  const { error } = await supabase.from('lead_forms').insert({ org_id: ctx.workspace.orgId, name: name.data, default_source_id: typeof src === 'string' && src ? src : null })
  if (error) return { error: 'Could not create the form.' }
  revalidatePath('/settings/sales')
  return { ok: 'Form created. Copy its link or embed code below.' }
}

export async function toggleForm(id: string, active: boolean) {
  await guard()
  const supabase = await createClient()
  await supabase.from('lead_forms').update({ is_active: active }).eq('id', id)
  revalidatePath('/settings/sales')
}
