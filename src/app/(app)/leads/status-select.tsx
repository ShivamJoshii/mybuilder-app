'use client'
import { useOptimistic, useTransition } from 'react'
import { setLeadStatus } from './actions'
import { cn } from '@/lib/utils'

export function StatusSelect({ id, value, statuses, compact }: { id: string; value: string; statuses: { id: string; name: string; color: string }[]; compact?: boolean }) {
  const [v, setV] = useOptimistic(value)
  const [pending, start] = useTransition()
  const color = statuses.find((s) => s.id === v)?.color
  return (
    <select aria-label="Status" value={v} disabled={pending}
      onChange={(e) => { const n = e.target.value; start(async () => { setV(n); await setLeadStatus(id, n) }) }}
      className={cn('rounded border border-border-strong bg-surface pl-1.5 pr-6 text-[12px]', compact ? 'h-6 w-full' : 'h-7')}
      style={{ borderLeft: `4px solid ${color}` }}>
      {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  )
}
