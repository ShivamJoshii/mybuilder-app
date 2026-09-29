'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'

export async function setActiveOrg(orgId: string) {
  z.string().uuid().parse(orgId)
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_active_org', { p_org: orgId })
  if (error) throw new Error('Could not switch company')
  revalidatePath('/', 'layout')
}

export async function setJobSelection(all: boolean, jobIds: string[]) {
  const ids = z.array(z.string().uuid()).max(500).parse(jobIds)
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_job_selection', { p_org: ctx.selectionKey, p_all: all, p_job_ids: ids })
  if (error) throw new Error('Could not save job selection')
  revalidatePath('/', 'layout')
}
