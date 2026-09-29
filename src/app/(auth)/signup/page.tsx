import type { Metadata } from 'next'
import { SignupForm } from './signup-form'

export const metadata: Metadata = { title: 'Create account' }

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? sp.next : '/'
  const email = typeof sp.email === 'string' ? sp.email : undefined
  return <SignupForm next={next} email={email} />
}
