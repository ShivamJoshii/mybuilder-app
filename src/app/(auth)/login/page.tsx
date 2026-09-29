import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? sp.next : '/'
  const email = typeof sp.email === 'string' ? sp.email : undefined
  return <LoginForm next={next} email={email} />
}
