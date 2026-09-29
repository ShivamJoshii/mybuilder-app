'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'

const schema = z.object({
  module: z.string().min(1).max(40),
  name: z.string().trim().min(1, 'Name the view').max(60),
  query: z.string().max(2000),
  is_shared: z.boolean(),
  is_default: z.boolean(),
  path: z.string().startsWith('/'),
})

export async function saveView(input: z.input<typeof schema>) {
  const ctx = await getAppContext()
  const d = schema.parse(input)
  const supabase = await createClient()
  if (d.is_default) {
    await supabase.from('saved_views').update({ is_default: false }).eq('user_id', ctx.userId).eq('org_id', ctx.selectionKey).eq('module', d.module)
  }
  const { error } = await supabase.from('saved_views').insert({
    org_id: ctx.selectionKey, user_id: ctx.userId, module: d.module, name: d.name,
    is_shared: d.is_shared && ctx.workspace.mode === 'builder', is_default: d.is_default, config: { query: d.query },
  })
  if (error) throw new Error('Could not save the view')
  revalidatePath(d.path)
}

export async function deleteView(id: string, path: string) {
  await getAppContext()
  const supabase = await createClient()
  await supabase.from('saved_views').delete().eq('id', z.string().uuid().parse(id))
  revalidatePath(path)
}
