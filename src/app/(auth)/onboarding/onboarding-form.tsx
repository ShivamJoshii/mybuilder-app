'use client'
import { useActionState, useState } from 'react'
import { HardHat, Home } from 'lucide-react'
import { createCompany, type FormState } from '../actions'
import { Field, Input, Select } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { SubmitButton } from '../submit-button'
import { PROVINCES, cn } from '@/lib/utils'

export function OnboardingForm() {
  const [state, action] = useActionState<FormState, FormData>(createCompany, {})
  const [kind, setKind] = useState<'builder' | 'sub'>((state.fields?.kind as 'builder' | 'sub') ?? 'builder')
  const options = [
    { value: 'builder' as const, icon: Home, title: 'I run a building company', body: 'Manage jobs, subs and clients.' },
    { value: 'sub' as const, icon: HardHat, title: 'I’m a trade or supplier', body: 'Work with the builders who hire you.' },
  ]
  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Set up your company</h1>
        <p className="mt-1 text-[13px] text-text-3">You can invite your team after this.</p>
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-2" role="radiogroup" aria-label="Company type">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={kind === o.value}
            onClick={() => setKind(o.value)}
            className={cn(
              'flex items-start gap-3 rounded-md border p-3 text-left',
              kind === o.value ? 'border-brand bg-brand-soft' : 'border-border hover:bg-surface-2',
            )}
          >
            <o.icon className="mt-0.5 size-5 text-brand" />
            <span>
              <span className="block font-medium">{o.title}</span>
              <span className="block text-[13px] text-text-3">{o.body}</span>
            </span>
          </button>
        ))}
      </div>
      <Field label="Company name" htmlFor="name">
        <Input id="name" name="name" required defaultValue={state.fields?.name} />
      </Field>
      {kind === 'builder' && (
        <Field label="Province" htmlFor="province">
          <Select id="province" name="province" defaultValue="AB">
            {PROVINCES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </Select>
        </Field>
      )}
      <SubmitButton>Continue</SubmitButton>
    </form>
  )
}
