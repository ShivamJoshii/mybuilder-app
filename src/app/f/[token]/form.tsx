'use client'
import { useActionState } from 'react'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { submitLead, type PublicFormState } from './actions'

export function LeadFormClient({ token, thankYou }: { token: string; thankYou: string }) {
  const [state, action, pending] = useActionState<PublicFormState, FormData>(submitLead.bind(null, token), {})
  if (state.done) return <Alert tone="success">{thankYou}</Alert>
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {state.error && <Alert className="sm:col-span-2">{state.error}</Alert>}
      <Field label="First name" htmlFor="pf_first" required><Input id="pf_first" name="first_name" required maxLength={80} autoComplete="given-name" /></Field>
      <Field label="Last name" htmlFor="pf_last"><Input id="pf_last" name="last_name" maxLength={80} autoComplete="family-name" /></Field>
      <Field label="Email" htmlFor="pf_email"><Input id="pf_email" name="email" type="email" maxLength={200} autoComplete="email" /></Field>
      <Field label="Phone" htmlFor="pf_phone"><Input id="pf_phone" name="phone" type="tel" maxLength={40} autoComplete="tel" /></Field>
      <Field label="Project address" htmlFor="pf_street" className="sm:col-span-2"><Input id="pf_street" name="street" maxLength={200} autoComplete="street-address" /></Field>
      <Field label="City" htmlFor="pf_city"><Input id="pf_city" name="city" maxLength={100} /></Field>
      <Field label="Postal code" htmlFor="pf_postal"><Input id="pf_postal" name="postal_code" maxLength={10} /></Field>
      <Field label="Tell us about your project" htmlFor="pf_msg" className="sm:col-span-2"><Textarea id="pf_msg" name="message" maxLength={4000} className="min-h-24" /></Field>
      {/* Honeypot: humans never see or fill this */}
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="sm:col-span-2"><Button type="submit" variant="primary" size="lg" disabled={pending}>{pending ? 'Sending…' : 'Send'}</Button></div>
    </form>
  )
}
