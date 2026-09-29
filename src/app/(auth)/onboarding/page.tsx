import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/context'
import { OnboardingForm } from './onboarding-form'

export const metadata: Metadata = { title: 'Set up your company' }

export default async function OnboardingPage() {
  if (!(await getUser())) redirect('/login?next=/onboarding')
  return <OnboardingForm />
}
