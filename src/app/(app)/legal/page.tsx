import type { Metadata } from 'next'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Legal' }

export default function LegalPage() {
  return (
    <>
      <PageHeader title="Legal" />
      <div className="max-w-3xl p-5">
        <Card className="space-y-3 p-5 text-[13px] text-text-2">
          <p>Terms of service and privacy policy will be published here before launch.</p>
          <p>Your data is stored in Canada (AWS ca-central-1). Questions: support@mybuilder.ca</p>
        </Card>
      </div>
    </>
  )
}
