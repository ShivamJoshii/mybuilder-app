import type { Metadata } from 'next'
import { Bell } from 'lucide-react'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = { title: 'Notifications' }

export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Notifications" />
      <div className="p-5">
        <Card><EmptyState icon={Bell} title="You’re all caught up" body="Alerts for new logs, messages, RFIs, POs and more will show up here, and by email, text or push based on your settings." action={<Badge>Coming in build step 4</Badge>} /></Card>
      </div>
    </>
  )
}
