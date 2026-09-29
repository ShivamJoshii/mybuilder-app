import { MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { initials } from '@/lib/utils'
import { CommentComposer } from './comment-composer'

type Mode = 'builder' | 'sub' | 'client'

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Threaded comments for any record. RLS decides which comments this user sees. */
export async function CommentThread({
  jobId, recordType, recordId, mode, path, canShareWithClient = true,
}: { jobId: string; recordType: string; recordId: string; mode: Mode; path: string; canShareWithClient?: boolean }) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('comments')
    .select('id,body,author_type,visible_to_subs,visible_to_clients,created_at,edited_at,parent_id,profiles(first_name,last_name,email)')
    .eq('record_type', recordType).eq('record_id', recordId)
    .order('created_at')
  const comments = data ?? []
  return (
    <Card>
      <CardHeader title="Comments" description={mode === 'builder' ? 'Choose who sees each comment.' : undefined} />
      {comments.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-4 text-[13px] text-text-3"><MessageSquare className="size-4" />No comments yet.</div>
      ) : (
        <ul className="divide-y divide-border">
          {comments.map((c) => {
            const p = c.profiles as { first_name: string; last_name: string; email: string } | null
            const name = p ? `${p.first_name} ${p.last_name}`.trim() || p.email : 'Someone'
            return (
              <li key={c.id} className="flex gap-3 px-4 py-3">
                <Avatar text={initials(p)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-medium">{name}</span>
                    {c.author_type !== 'internal' && <Badge>{c.author_type === 'sub' ? 'Sub/vendor' : 'Client'}</Badge>}
                    <span className="text-xs text-text-3">{timeAgo(c.created_at)}{c.edited_at ? ' · edited' : ''}</span>
                    {mode === 'builder' && (
                      <span className="ml-auto flex gap-1">
                        {c.visible_to_subs && <Badge tone="brand">Subs</Badge>}
                        {c.visible_to_clients && <Badge tone="brand">Client</Badge>}
                        {!c.visible_to_subs && !c.visible_to_clients && <Badge>Internal</Badge>}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px]">{c.body}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <CommentComposer jobId={jobId} recordType={recordType} recordId={recordId} path={path} mode={mode} canShareWithClient={canShareWithClient} />
    </Card>
  )
}
