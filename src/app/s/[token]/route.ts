import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { signDownload } from '@/lib/storage'

/** Public share link: anyone with the link can open the file (until revoked). */
export async function GET(request: NextRequest, { params }: RouteContext<'/s/[token]'>) {
  const { token } = await params
  const supabase = await createClient()
  const { data } = await supabase.rpc('resolve_share_link', { p_token: token })
  const f = Array.isArray(data) ? data[0] : null
  if (!f) return new NextResponse('This link is no longer available.', { status: 404 })
  return NextResponse.redirect(await signDownload(f.storage_key, f.name, request.nextUrl.searchParams.get('download') !== '1'), { status: 302 })
}
