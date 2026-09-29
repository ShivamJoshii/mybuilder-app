'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type FormState = { error?: string; message?: string; fields?: Record<string, string> }

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === 'string' ? next : ''
  return n.startsWith('/') && !n.startsWith('//') ? n : '/'
}

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') })
  const fields = { email: String(formData.get('email') ?? '') }
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: 'Email or password is incorrect.', fields }
  redirect(safeNext(formData.get('next')))
}

const signupSchema = z.object({
  first_name: z.string().trim().min(1, 'Enter your first name').max(80),
  last_name: z.string().trim().min(1, 'Enter your last name').max(80),
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(10, 'Use at least 10 characters for your password'),
})

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    first_name: formData.get('first_name'), last_name: formData.get('last_name'),
    email: formData.get('email'), password: formData.get('password'),
  }
  const fields = { first_name: String(raw.first_name ?? ''), last_name: String(raw.last_name ?? ''), email: String(raw.email ?? '') }
  const parsed = signupSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields }
  const next = safeNext(formData.get('next'))
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { first_name: parsed.data.first_name, last_name: parsed.data.last_name },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  })
  if (error) {
    const msg = /registered|exists/i.test(error.message) ? 'An account with this email already exists. Sign in instead.' : error.message
    return { error: msg, fields }
  }
  if (!data.session) return { message: 'Check your email to confirm your account, then sign in.' }
  redirect(next === '/' ? '/onboarding' : next)
}

export async function signout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

const orgSchema = z.object({
  kind: z.enum(['builder', 'sub']),
  name: z.string().trim().min(2, 'Enter your company name').max(120),
  province: z.string().length(2).optional(),
})

export async function createCompany(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = orgSchema.safeParse({
    kind: formData.get('kind'), name: formData.get('name'), province: formData.get('province') || undefined,
  })
  const fields = { name: String(formData.get('name') ?? ''), kind: String(formData.get('kind') ?? 'builder') }
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields }
  const supabase = await createClient()
  const { error } = parsed.data.kind === 'builder'
    ? await supabase.rpc('create_builder_org', { p_name: parsed.data.name, p_province: parsed.data.province ?? 'AB' })
    : await supabase.rpc('create_sub_org', { p_name: parsed.data.name })
  if (error) return { error: 'Could not create the company. Try again.', fields }
  redirect('/summary')
}

export async function acceptInvite(_: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get('token') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_invite', { p_token: token })
  if (error) return { error: error.message }
  redirect('/summary')
}
