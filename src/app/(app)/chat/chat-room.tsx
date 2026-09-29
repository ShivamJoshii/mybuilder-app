'use client'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { chatFeed, sendChat } from './actions'

type Msg = { id: string; author_id: string; author: string; body: string; created_at: string }

const time = (iso: string, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }).format(new Date(iso))
const ini = (n: string) => n.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()

/** Conversation view. New messages arrive over Supabase Realtime; polling is the fallback when the socket is down. */
export function ChatRoom({ conversationId, me, initial, tz }: { conversationId: string; me: string; initial: Msg[]; tz: string }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const end = useRef<HTMLDivElement>(null)
  const last = msgs[msgs.length - 1]?.created_at ?? null

  const poll = useCallback(async () => {
    const more = (await chatFeed(conversationId, last)) as Msg[]
    if (more.length) setMsgs((m) => [...m, ...more.filter((x) => !m.some((y) => y.id === x.id))])
  }, [conversationId, last])

  const [live, setLive] = useState(false)
  const pollRef = useRef(poll)
  useEffect(() => { pollRef.current = poll }, [poll])
  useEffect(() => {
    const sb = createClient()
    let ch: ReturnType<typeof sb.channel> | null = null
    let gone = false
    // Join with the user's token so Realtime applies their RLS (only members get the rows)
    void sb.auth.getSession().then(({ data }) => {
      if (gone || !data.session) return
      sb.realtime.setAuth(data.session.access_token)
      ch = sb.channel(`chat:${conversationId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` }, () => { void pollRef.current() })
        // "live" only once Realtime confirms the database subscription (the channel can join earlier)
        .on('system', {}, (p: { extension?: string; status?: string }) => {
          if (p.extension === 'postgres_changes') { setLive(p.status === 'ok'); void pollRef.current() }
        })
        .subscribe((status) => { if (status !== 'SUBSCRIBED') setLive(false) })
    })
    return () => { gone = true; if (ch) void sb.removeChannel(ch) }
  }, [conversationId])
  useEffect(() => {
    const t = setInterval(poll, live ? 15000 : 3000)
    return () => clearInterval(t)
  }, [poll, live])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  const send = () => {
    const body = text.trim()
    if (!body) return
    start(async () => {
      const r = await sendChat(conversationId, body)
      if (r.error) { setError(r.error); return }
      setText(''); setError('')
      await poll()
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite" data-testid="chat-feed" data-live={live ? 'on' : 'off'}>
        {msgs.map((m) => {
          const mine = m.author_id === me
          return (
            <div key={m.id} className={cn('flex gap-2', mine && 'flex-row-reverse')}>
              {!mine && <Avatar text={ini(m.author)} />}
              <div className={cn('max-w-[75%] rounded-lg px-3 py-2 text-[14px]', mine ? 'bg-brand text-white' : 'bg-surface-2')}>
                {!mine && <div className="text-xs font-medium text-text-2">{m.author}</div>}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <div className={cn('mt-0.5 text-[11px]', mine ? 'text-white/70' : 'text-text-3')}>{time(m.created_at, tz)}</div>
              </div>
            </div>
          )
        })}
        {msgs.length === 0 && <p className="text-center text-[13px] text-text-3">No messages yet. Say hello.</p>}
        <div ref={end} />
      </div>
      {error && <p className="px-4 text-xs text-danger">{error}</p>}
      <div className="flex items-end gap-2 border-t border-border p-3">
        <Textarea aria-label="Message" rows={2} value={text} maxLength={4000} placeholder="Write a message… (Enter to send, Shift+Enter for a new line)" className="min-h-0 flex-1 resize-none"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <Button variant="primary" onClick={send} disabled={pending || !text.trim()} aria-label="Send"><Send /></Button>
      </div>
    </div>
  )
}
