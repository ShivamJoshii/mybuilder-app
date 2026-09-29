import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getObjectStream } from '@/lib/storage'

/** Plan sheet file bytes, same-origin so the viewer can render them. RLS decides access. */
export async function GET(_: Request, { params }: RouteContext<'/plans/versions/[id]/file'>) {
  const { id } = await params
  const supabase = await createClient()
  const { data: v } = await supabase.from('plan_sheet_versions').select('storage_key,mime,status').eq('id', id).maybeSingle()
  if (!v || v.status !== 'ready') return new NextResponse('Not found', { status: 404 })
  const o = await getObjectStream(v.storage_key)
  if (!o.body) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(o.body, { headers: { 'content-type': v.mime, 'cache-control': 'private, max-age=3600', ...(o.size ? { 'content-length': String(o.size) } : {}) } })
}
