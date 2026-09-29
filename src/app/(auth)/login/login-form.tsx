'use client'
import Link from 'next/link'
import { useActionState } from 'react'
import { login, type FormState } from '../actions'
import { Field, Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { SubmitButton } from '../submit-button'

export function LoginForm({ next, email }: { next: string; email?: string }) {
  const [state, action] = useActionState<FormState, FormData>(login, {})
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold">Sign in</h1>
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email ?? email} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton>Sign in</SubmitButton>
      <p className="text-center text-[13px] text-text-3">
        New to MyBuilder?{' '}
        <Link className="text-brand hover:underline" href={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>
          Create an account
        </Link>
      </p>
    </form>
  )
}
