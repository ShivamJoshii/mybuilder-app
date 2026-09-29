'use client'
import { useOptimistic, useTransition } from 'react'
import { toggleChecklistItem } from '../actions'

export function ChecklistItem({ todoId, id, body, done }: { todoId: string; id: string; body: string; done: boolean }) {
  const [value, setValue] = useOptimistic(done)
  const [, start] = useTransition()
  return (
    <li className="px-4 py-2">
      <label className="flex items-center gap-3 text-[13px]">
        <input type="checkbox" checked={value} className="size-4 accent-brand"
          onChange={(e) => { const n = e.target.checked; start(async () => { setValue(n); await toggleChecklistItem(todoId, id, n) }) }} />
        <span className={value ? 'text-text-3 line-through' : ''}>{body}</span>
      </label>
    </li>
  )
}
