import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/context'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AcceptForm } from './accept-form'

export const metadata: Metadata = { title: 'Accept invite' }

const KIND_LABEL = { internal: 'join the team at', sub: 'work with', client: 'follow your project with' } as const

export default async function InvitePage({ params }: PageProps<'/invite/[token]'>) {
  const { token } = await params
  const supabase = await createClient()
  const { data } = await supabase.rpc('invite_preview', { p_token: token })
  const invite = Array.isArray(data) ? data[0] : null

  if (!invite) return <Alert>This invite link is not valid.</Alert>
  if (invite.accepted) return <Alert tone="info">This invite has already been used. <Link className="underline" href="/login">Sign in</Link></Alert>
  if (invite.expired) return <Alert>This invite has expired. Ask for a new one.</Alert>

  const user = await getUser()
  const next = `/invite/${token}`
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">You’re invited</h1>
        <p className="mt-1 text-[13px] text-text-2">
          You’ve been invited to {KIND_LABEL[invite.kind as keyof typeof KIND_LABEL]} <strong>{invite.org_name}</strong> on MyBuilder.
        </p>
      </div>
      {user ? (
        user.email.toLowerCase() === invite.email.toLowerCase() ? (
          <AcceptForm token={token} />
        ) : (
          <Alert>
            This invite was sent to {invite.email}. You’re signed in as {user.email}. Sign out and use the invited email.
          </Alert>
        )
      ) : (
        <div className="grid gap-2">
          <Button asChild variant="primary" size="lg">
            <Link href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`}>Create account</Link>
          </Button>
          <Button asChild size="lg">
            <Link href={`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`}>I already have an account</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
