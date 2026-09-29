'use server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext } from '@/lib/context'

const schema = z.array(z.object({ key: z.string().max(60), email: z.boolean(), text: z.boolean(), push: z.boolean() })).max(200)

export async function saveNotificationPrefs(input: z.input<typeof schema>) {
  const ctx = await getAppContext()
  const rows = schema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('notification_prefs').upsert(rows.map((r) => ({ user_id: ctx.userId, type: r.key, email: r.email, text: r.text, push: r.push })))
  if (error) throw new Error('Could not save notification settings')
}
