import type { Metadata } from 'next'
import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'
import { getAppContext } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { ChatRoom } from './chat-room'
import { NewChat } from './new-chat'

export const metadata: Metadata = { title: 'Chat' }

export default async function ChatPage({ searchParams }: PageProps<'/chat'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: chats } = await supabase.rpc('my_chats')
  const current = typeof sp.c === 'string' ? (chats ?? []).find((c) => c.conversation_id === sp.c) : (chats ?? [])[0]
  const feed = current ? ((await supabase.rpc('chat_feed', { p_conv: current.conversation_id })).data ?? []) : []
  if (current) await supabase.rpc('mark_chat_read', { p_conv: current.conversation_id })
  const w = ctx.workspace
  const builders = w.mode === 'builder' ? [{ id: w.orgId, name: w.orgName }]
    : w.mode === 'client' ? [{ id: w.orgId, name: w.orgName }]
    : ctx.buildersAsSub.filter((b) => !w.builderOrgId || b.builder_org_id === w.builderOrgId).map((b) => ({ id: b.builder_org_id, name: b.builder_name }))
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  const label = (c: { title: string | null; members: string[] | null }) => c.title ?? (c.members ?? []).join(', ') ?? 'Chat'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Chat" actions={<NewChat builders={builders} jobs={ctx.jobs.map(({ id, title, org_id }) => ({ id, title, org_id }))} />} />
      {(chats ?? []).length === 0 ? (
        <div className="p-5"><EmptyState icon={MessagesSquare} title="Real-time chat with your team and trades" body="Quick conversations that don’t need to be an email or an RFI. Start one with anyone on a job." /></div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <nav className="w-72 shrink-0 overflow-y-auto border-r border-border bg-surface" aria-label="Conversations">
            {(chats ?? []).map((c) => (
              <Link key={c.conversation_id} href={`/chat?c=${c.conversation_id}`}
                className={cn('block border-b border-border px-3 py-2 text-[13px] hover:bg-surface-2', c.conversation_id === current?.conversation_id && 'bg-brand-soft')}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{label(c)}</span>
                  {c.unread > 0 && c.conversation_id !== current?.conversation_id && <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                </div>
                {c.job_id && <div className="truncate text-xs text-text-3">{jobName.get(c.job_id) ?? 'Job'}</div>}
                {c.last_body && <div className="truncate text-xs text-text-3">{c.last_body}</div>}
              </Link>
            ))}
          </nav>
          {current ? (
            <Card className="m-3 flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border px-4 py-2">
                <div className="font-medium">{label(current)}</div>
                <div className="text-xs text-text-3">{current.title ? (current.members ?? []).join(', ') : ''}{current.job_id ? `${current.title ? ' · ' : ''}${jobName.get(current.job_id) ?? ''}` : ''}</div>
              </div>
              <ChatRoom key={current.conversation_id} conversationId={current.conversation_id} me={ctx.userId} initial={feed} />
            </Card>
          ) : <div className="p-5 text-[13px] text-text-3">Pick a conversation.</div>}
        </div>
      )}
    </div>
  )
}
