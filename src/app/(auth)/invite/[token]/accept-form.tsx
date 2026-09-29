'use client'
import { useActionState } from 'react'
import { acceptInvite, type FormState } from '../../actions'
import { Alert } from '@/components/ui/alert'
import { SubmitButton } from '../../submit-button'

export function AcceptForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(acceptInvite, {})
  return (
    <form action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="token" value={token} />
      <SubmitButton>Accept invite</SubmitButton>
    </form>
  )
}
