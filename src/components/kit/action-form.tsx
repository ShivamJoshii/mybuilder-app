'use client'
import { keepValues } from '@/lib/forms'
import { useActionState, useEffect, useRef } from 'react'
import { Alert } from '@/components/ui/alert'

export type ActionState = { error?: string; ok?: string }

/** Small form wrapper for settings actions: shows error/success and resets on success. */
export function ActionForm({
  action, children, className, resetOnSuccess = true,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  children: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
}) {
  const [state, formAction] = useActionState(action, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok && resetOnSuccess) ref.current?.reset() }, [state, resetOnSuccess])
  return (
    <form ref={ref} onSubmit={keepValues(formAction)} className={className}>
      {state.error && <Alert className="mb-3">{state.error}</Alert>}
      {state.ok && <Alert tone="success" className="mb-3">{state.ok}</Alert>}
      {children}
    </form>
  )
}
