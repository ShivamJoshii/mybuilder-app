'use client'
import { useOptimistic, useTransition } from 'react'
import { toggleTodo } from './actions'

export function TodoCheck({ id, done, disabled }: { id: string; done: boolean; disabled?: boolean }) {
  const [value, setValue] = useOptimistic(done)
  const [, start] = useTransition()
  return (
    <input
      type="checkbox"
      checked={value}
      disabled={disabled}
      title={disabled ? 'Finish the checklist first' : value ? 'Mark incomplete' : 'Mark complete'}
      aria-label={value ? 'Mark incomplete' : 'Mark complete'}
      onChange={(e) => { const next = e.target.checked; start(async () => { setValue(next); await toggleTodo(id, next) }) }}
      className="mt-0.5 size-4 shrink-0 accent-brand disabled:opacity-40"
    />
  )
}
