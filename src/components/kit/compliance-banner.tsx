import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Alert } from '@/components/ui/alert'

/** Warns the builder when a sub's WCB clearance or insurance is missing, expired or about to expire. */
export async function ComplianceBanner({ builderId, subId }: { builderId: string; subId: string | null }) {
  if (!subId) return null
  const supabase = await createClient()
  const [{ data }, { data: link }, { data: org }] = await Promise.all([
    supabase.rpc('sub_compliance', { p_builder: builderId, p_sub: subId }),
    supabase.from('builder_sub_links').select('id').eq('builder_org_id', builderId).eq('sub_org_id', subId).maybeSingle(),
    supabase.from('organizations').select('compliance_blocks_payment').eq('id', builderId).maybeSingle(),
  ])
  const s = data?.[0]
  if (!s || s.status === 'ok') return null
  const blocking = org?.compliance_blocks_payment && s.status !== 'expiring'
  return (
    <Alert tone={s.status === 'expiring' ? 'info' : 'danger'}>
      <span className="font-medium">Compliance: </span>{s.detail}.{blocking ? ' Payments are on hold until it’s fixed.' : ''}
      {link && <> <Link href={`/settings/subs/${link.id}`} className="underline">Review documents</Link></>}
    </Alert>
  )
}
