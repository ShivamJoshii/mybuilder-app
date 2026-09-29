'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'
import type { ActionState } from '@/components/kit/action-form'
import { CUSTOM_FIELD_MODULES, readField, type FieldDef } from '@/lib/custom-fields'

/** Save every custom field shown on a record's form. Empty inputs clear the value. */
export async function saveCustomFields(module: string, recordId: string, orgId: string, path: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await getAppContext()
  const mod = z.enum(CUSTOM_FIELD_MODULES).parse(module)
  const rid = z.string().uuid().parse(recordId)
  const supabase = await createClient()
  const { data: defs } = await supabase.from('custom_field_defs').select('id,label,data_type,options,tooltip,is_required,visible_to_subs,visible_to_clients')
    .eq('org_id', z.string().uuid().parse(orgId)).eq('module', mod).eq('is_active', true).neq('data_type', 'file')
  const upserts: { def_id: string; record_id: string; org_id: string; value: never }[] = []
  const clears: string[] = []
  try {
    for (const d of (defs ?? []) as FieldDef[]) {
      const v = readField(d, fd)
      if (v === undefined) {
        if (d.is_required) return { error: `${d.label} is required.` }
        clears.push(d.id)
      } else upserts.push({ def_id: d.id, record_id: rid, org_id: orgId, value: v as never })
    }
  } catch (e) {
    return { error: (e as Error).message }
  }
  if (upserts.length) {
    const { error } = await supabase.from('custom_field_values').upsert(upserts)
    if (error) return { error: error.code === '42501' ? 'You can’t edit these fields.' : 'Check the values and try again.' }
  }
  if (clears.length) await supabase.from('custom_field_values').delete().eq('record_id', rid).in('def_id', clears)
  revalidatePath(path)
  return { ok: 'Saved.' }
}
