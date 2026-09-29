import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Mark one notification read, then go to what it points at. */
export async function GET(request: NextRequest, { params }: RouteContext<'/notifications/open/[id]'>) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('notifications').select('link').eq('id', id).maybeSingle()
  if (data) await supabase.rpc('mark_notifications_read', { p_ids: [id] })
  const link = data?.link && data.link.startsWith('/') && !data.link.startsWith('//') ? data.link : '/notifications'
  return NextResponse.redirect(new URL(link, request.url))
}
