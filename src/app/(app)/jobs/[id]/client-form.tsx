'use client'
import { useActionState, useRef, useEffect } from 'react'
import { Field, Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import type { JobFormState } from '../actions'

export function AddClientForm({ action }: { action: (s: JobFormState, fd: FormData) => Promise<JobFormState> }) {
  const [state, formAction, pending] = useActionState(action, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { if (!pending && !state.error) ref.current?.reset() }, [pending, state])
  return (
    <form ref={ref} action={formAction} className="grid gap-3 border-t border-border p-4 sm:grid-cols-2">
      {state.error && <Alert className="sm:col-span-2">{state.error}</Alert>}
      <Field label="First name" htmlFor="c_first" required><Input id="c_first" name="first_name" required /></Field>
      <Field label="Last name" htmlFor="c_last"><Input id="c_last" name="last_name" /></Field>
      <Field label="Email" htmlFor="c_email"><Input id="c_email" name="email" type="email" /></Field>
      <Field label="Phone" htmlFor="c_phone"><Input id="c_phone" name="phone" type="tel" /></Field>
      <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
        <input type="checkbox" name="invite" defaultChecked className="accent-brand" /> Invite them to the client portal
      </label>
      <div className="sm:col-span-2"><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Adding…' : 'Add client'}</Button></div>
    </form>
  )
}
