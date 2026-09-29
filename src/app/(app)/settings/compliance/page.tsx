import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import { getAppContext } from '@/lib/context'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Certificates } from '@/components/kit/certificates'

export const metadata: Metadata = { title: 'Compliance documents' }

/** Subs keep WCB clearance and insurance on file with each builder they work for. */
export default async function CompliancePage() {
  const ctx = await getAppContext()
  const links = ctx.buildersAsSub
  return (
    <>
      <PageHeader title="Compliance documents" />
      <div className="max-w-5xl space-y-5 p-5">
        {links.length === 0 && <Card><EmptyState icon={ShieldCheck} title="No builders yet" body="When a builder adds you, you can send them your WCB clearance and insurance here." /></Card>}
        {links.map((l) => (
          <Certificates key={l.link_id} builderId={l.builder_org_id} subId={l.sub_org_id} uploaderOrgId={l.sub_org_id} canEdit path="/settings/compliance" title={`For ${l.builder_name}`} tz={ctx.tz} />
        ))}
      </div>
    </>
  )
}
