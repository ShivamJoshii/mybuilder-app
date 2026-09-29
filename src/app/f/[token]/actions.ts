'use server'
import { createClient } from '@/lib/supabase/server'

export type PublicFormState = { error?: string; done?: boolean }

export async function submitLead(token: string, _: PublicFormState, fd: FormData): Promise<PublicFormState> {
  if (String(fd.get('company_website') ?? '') !== '') return { done: true }   // bot
  const payload = Object.fromEntries(['first_name', 'last_name', 'email', 'phone', 'street', 'city', 'postal_code', 'message']
    .map((k) => [k, String(fd.get(k) ?? '').slice(0, 4000)]))
  if (!payload.first_name.trim()) return { error: 'Please enter your first name.' }
  if (!payload.email.trim() && !payload.phone.trim()) return { error: 'Please give us an email or phone number.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_lead_form', { p_token: token, p_payload: payload })
  if (error) return { error: /Invalid email/.test(error.message) ? 'Please check your email address.' : /Too many/.test(error.message) ? 'We’re getting a lot of requests. Please try again soon.' : 'Something went wrong. Please try again.' }
  if (!data) return { error: 'This form is no longer accepting responses.' }
  return { done: true }
}
