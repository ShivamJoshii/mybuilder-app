import 'server-only'
import { createClient as create } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * Service-role client. Bypasses RLS — use only for trusted server-to-server
 * work (inbound email webhook) and call SECURITY DEFINER functions, never ad-hoc queries.
 */
export function createAdminClient() {
  return create<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
}
