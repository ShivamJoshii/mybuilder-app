import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getObjectStream } from '@/lib/storage'

/** A builder's logo, for anyone who can see that company (team, linked subs, clients). */
export async function GET(_: Request, { params }: RouteContext<'/branding/[orgId]/logo'>) {
  const { orgId } = await params
  const supabase = await createClient()
  const { data: org } = await supabase.from('organizations').select('logo_url').eq('id', orgId).maybeSingle()
  if (!org?.logo_url?.startsWith('storage:')) return new NextResponse('Not found', { status: 404 })
  const o = await getObjectStream(org.logo_url.slice(8))
  if (!o.body) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(o.body, { headers: { 'content-type': o.mime, 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } })
}
