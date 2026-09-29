'use client'
import { keepValues } from '@/lib/forms'
import Link from 'next/link'
import { useActionState } from 'react'
import { signup, type FormState } from '../actions'
import { Field, Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { SubmitButton } from '../submit-button'

export function SignupForm({ next, email }: { next: string; email?: string }) {
  const [state, action] = useActionState<FormState, FormData>(signup, {})
  if (state.message) return <Alert tone="success">{state.message}</Alert>
  return (
    <form onSubmit={keepValues(action)} className="space-y-4">
      <h1 className="text-lg font-semibold">Create your account</h1>
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="next" value={next} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="first_name">
          <Input id="first_name" name="first_name" autoComplete="given-name" required defaultValue={state.fields?.first_name} />
        </Field>
        <Field label="Last name" htmlFor="last_name">
          <Input id="last_name" name="last_name" autoComplete="family-name" required defaultValue={state.fields?.last_name} />
        </Field>
      </div>
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email ?? email} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <SubmitButton>Create account</SubmitButton>
      <p className="text-center text-[13px] text-text-3">
        Already have an account?{' '}
        <Link className="text-brand hover:underline" href={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>
          Sign in
        </Link>
      </p>
    </form>
  )
}
