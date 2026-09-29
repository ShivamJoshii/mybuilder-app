import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { signDownload } from '@/lib/storage'

/** Signed download after RLS decides the caller may see the file. ?inline=1 opens in the browser. */
export async function GET(request: NextRequest, { params }: RouteContext<'/files/[id]/download'>) {
  const { id } = await params
  const supabase = await createClient()
  const version = request.nextUrl.searchParams.get('v')
  const { data: f } = await supabase.from('files').select('name,storage_key,status,version').eq('id', id).maybeSingle()
  if (!f || f.status !== 'ready') return new NextResponse('Not found', { status: 404 })
  let key = f.storage_key
  if (version && Number(version) !== f.version) {
    const { data: v } = await supabase.from('file_versions').select('storage_key').eq('file_id', id).eq('version', Number(version)).maybeSingle()
    if (!v) return new NextResponse('Not found', { status: 404 })
    key = v.storage_key
  }
  const url = await signDownload(key, f.name, request.nextUrl.searchParams.get('inline') === '1')
  return NextResponse.redirect(url, { status: 302 })
}
