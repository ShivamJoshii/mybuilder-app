import type { Metadata } from 'next'
import Link from 'next/link'
import { Bell, CheckCheck, Settings } from 'lucide-react'
import { getAppContext } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { timeAgo } from '@/components/kit/comments'
import { cn, initials } from '@/lib/utils'
import { markAllRead } from './actions'

export const metadata: Metadata = { title: 'Notifications' }

export default async function NotificationsPage() {
  await getAppContext()
  const supabase = await createClient()
  const { data } = await supabase.from('notifications')
    .select('id,title,body,link,created_at,read_at,type,actor:profiles!notifications_actor_id_fkey(first_name,last_name,email)')
    .order('created_at', { ascending: false }).limit(100)
  const items = data ?? []
  const unread = items.filter((n) => !n.read_at).length
  return (
    <>
      <PageHeader title="Notifications" actions={<>
        <Button asChild variant="ghost"><Link href="/settings/notifications"><Settings />Settings</Link></Button>
        {unread > 0 && <form action={markAllRead}><Button type="submit"><CheckCheck />Mark all read</Button></form>}
      </>} />
      <div className="p-5">
        <Card>
          {items.length === 0 ? (
            <EmptyState icon={Bell} title="You’re all caught up" body="You’ll hear about new logs, to-dos, RFIs and more here, and by email or text based on your settings." />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const a = n.actor as { first_name: string; last_name: string; email: string } | null
                return (
                  <li key={n.id}>
                    <Link href={`/notifications/open/${n.id}`} className={cn('flex gap-3 px-4 py-3 hover:bg-surface-2', !n.read_at && 'bg-brand-soft/40')}>
                      <Avatar text={initials(a)} />
                      <div className="min-w-0 flex-1 text-[13px]">
                        <div className={cn(!n.read_at && 'font-semibold')}>{n.title}</div>
                        {n.body && <p className="line-clamp-1 text-text-3">{n.body}</p>}
                        <div className="mt-0.5 text-xs text-text-3">{a ? `${a.first_name} ${a.last_name}`.trim() + ' · ' : ''}{timeAgo(n.created_at)}</div>
                      </div>
                      {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
