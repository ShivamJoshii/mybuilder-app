import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LeadFormClient } from './form'

export const metadata: Metadata = { title: 'Contact us', robots: { index: false } }

/** Public lead form (no login). Can be embedded in a builder's website with ?embed=1. */
export default async function PublicLeadForm({ params, searchParams }: PageProps<'/f/[token]'>) {
  const { token } = await params
  const embed = (await searchParams).embed === '1'
  const supabase = await createClient()
  const { data } = await supabase.rpc('lead_form_info', { p_token: token })
  const info = Array.isArray(data) ? data[0] : null
  if (!info) notFound()
  return (
    <div className={embed ? 'p-3' : 'flex min-h-screen items-start justify-center bg-bg px-4 py-10'}>
      <div className={embed ? '' : 'w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-sm'}>
        {!embed && <h1 className="mb-1 text-lg font-semibold">{info.org_name}</h1>}
        <p className="mb-4 text-[13px] text-text-3">Tell us about your project and we’ll get back to you.</p>
        <LeadFormClient token={token} thankYou={info.thank_you} />
      </div>
    </div>
  )
}
