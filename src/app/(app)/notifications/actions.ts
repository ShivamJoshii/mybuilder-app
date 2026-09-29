'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'

export async function markAllRead() {
  await getAppContext()
  const supabase = await createClient()
  await supabase.rpc('mark_notifications_read', {})
  revalidatePath('/', 'layout')
}
