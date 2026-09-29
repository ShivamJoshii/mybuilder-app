import type { Metadata } from 'next'
import { MessagesSquare } from 'lucide-react'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = { title: 'Chat' }

export default function ChatPage() {
  return (
    <>
      <PageHeader title="Chat" />
      <div className="p-5">
        <Card><EmptyState icon={MessagesSquare} title="Real-time chat with your team and trades" body="Quick conversations that don’t need to be an email or an RFI." action={<Badge>Coming in build step 3</Badge>} /></Card>
      </div>
    </>
  )
}
