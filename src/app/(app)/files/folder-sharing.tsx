'use client'
import { useTransition } from 'react'
import { Users, Home } from 'lucide-react'
import { setFolderSharing } from './actions'
import { cn } from '@/lib/utils'

export function FolderSharing({ id, subs, clients }: { id: string; subs: boolean; clients: boolean }) {
  const [pending, start] = useTransition()
  const btn = (on: boolean, label: string, Icon: typeof Users, next: [boolean, boolean]) => (
    <button type="button" disabled={pending} title={`${on ? 'Hide from' : 'Share with'} ${label} (also updates files in this folder)`}
      onClick={(e) => { e.preventDefault(); start(() => setFolderSharing(id, next[0], next[1], true)) }}
      className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]', on ? 'border-brand/30 bg-brand-soft text-brand' : 'border-border text-text-3 hover:bg-surface-2')}>
      <Icon className="size-3" />{label}
    </button>
  )
  return (
    <span className="flex gap-1">
      {btn(subs, 'Subs', Users, [!subs, clients])}
      {btn(clients, 'Client', Home, [subs, !clients])}
    </span>
  )
}
