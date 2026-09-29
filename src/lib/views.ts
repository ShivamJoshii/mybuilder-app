import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { AppContext } from '@/lib/context'

export type SavedView = { id: string; name: string; query: string; is_shared: boolean; is_default: boolean; mine: boolean }

export async function fetchViews(ctx: AppContext, module: string): Promise<SavedView[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('saved_views').select('id,name,config,is_shared,is_default,user_id')
    .eq('org_id', ctx.selectionKey).eq('module', module).order('name')
  return (data ?? []).map((v) => ({
    id: v.id, name: v.name, query: String((v.config as { query?: string })?.query ?? ''),
    is_shared: v.is_shared, is_default: v.is_default && v.user_id === ctx.userId, mine: v.user_id === ctx.userId,
  }))
}
