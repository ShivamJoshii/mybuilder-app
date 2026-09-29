import type { Metadata } from 'next'
import { getAppContext } from '@/lib/context'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/kit/action-form'
import { updateProfile } from '../actions'

export const metadata: Metadata = { title: 'My profile' }

export default async function ProfilePage() {
  const ctx = await getAppContext()
  return (
    <>
      <PageHeader title="My profile" />
      <div className="max-w-xl p-5">
        <Card className="p-4">
          <ActionForm action={updateProfile} resetOnSuccess={false} className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="first_name" required><Input id="first_name" name="first_name" defaultValue={ctx.profile.first_name} required /></Field>
            <Field label="Last name" htmlFor="last_name" required><Input id="last_name" name="last_name" defaultValue={ctx.profile.last_name} required /></Field>
            <Field label="Email" htmlFor="email" hint="Contact support to change your login email."><Input id="email" value={ctx.email} disabled readOnly /></Field>
            <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={ctx.profile.phone ?? ''} /></Field>
            <div className="sm:col-span-2"><Button type="submit" variant="primary">Save</Button></div>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}
