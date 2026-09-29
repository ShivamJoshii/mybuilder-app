import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireBuilder } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ActionForm } from '@/components/kit/action-form'
import { createSignatureRequest } from '../actions'

export const metadata: Metadata = { title: 'Request signatures' }

type P = { first_name: string; last_name: string; email: string } | null
const nm = (p: P) => (p ? `${p.first_name} ${p.last_name}`.trim() || p.email : '')

export default async function NewSignatureRequest({ searchParams }: PageProps<'/signatures/new'>) {
  const sp = await searchParams
  await requireBuilder('files', 'add')
  const supabase = await createClient()
  const { data: f } = typeof sp.file === 'string' ? await supabase.from('files').select('id,name,job_id,org_id,mime').eq('id', sp.file).maybeSingle() : { data: null }
  if (!f?.job_id) notFound()
  const [{ data: clients }, { data: subs }, { data: team }] = await Promise.all([
    supabase.from('job_clients').select('user_id,first_name,last_name,email').eq('job_id', f.job_id).not('user_id', 'is', null),
    supabase.from('job_subs').select('sub_org_id, organizations(name)').eq('job_id', f.job_id),
    supabase.from('org_members').select('user_id,profiles(first_name,last_name,email)').eq('org_id', f.org_id).eq('status', 'active'),
  ])
  const options = [
    ...(clients ?? []).map((c) => ({ v: `u:${c.user_id}|Client — ${`${c.first_name} ${c.last_name}`.trim() || c.email}`, label: `${`${c.first_name} ${c.last_name}`.trim() || c.email}`, group: 'Client' })),
    ...(subs ?? []).map((s) => ({ v: `s:${s.sub_org_id}|${(s.organizations as { name: string } | null)?.name ?? 'Sub'}`, label: (s.organizations as { name: string } | null)?.name ?? 'Sub', group: 'Sub / vendor' })),
    ...(team ?? []).map((m) => ({ v: `u:${m.user_id}|${nm(m.profiles as P)}`, label: nm(m.profiles as P), group: 'Your team' })),
  ]
  return (
    <>
      <PageHeader title="Request signatures" actions={<Button asChild variant="ghost"><Link href="/documents"><ArrowLeft />Documents</Link></Button>} />
      <div className="max-w-3xl p-5">
        <Card className="p-4">
          {f.mime !== 'application/pdf' ? <p className="text-[13px]">Only PDF documents can be signed. Save {f.name} as a PDF and upload it.</p> : (
            <ActionForm action={createSignatureRequest.bind(null, f.id)} className="space-y-4">
              <p className="text-[13px] text-text-3">Document: <a className="text-brand hover:underline" href={`/files/${f.id}/download?inline=1`} target="_blank" rel="noreferrer">{f.name}</a></p>
              <Field label="Title" htmlFor="title" required><Input id="title" name="title" required maxLength={200} defaultValue={f.name.replace(/\.pdf$/i, '')} /></Field>
              <Field label="Message to signers" htmlFor="message"><Textarea id="message" name="message" rows={3} maxLength={4000} /></Field>
              <fieldset className="space-y-1.5 text-[13px]">
                <legend className="mb-1 font-medium text-text-2">Signers <span className="font-normal text-text-3">(clients need a portal account; in-order signing follows this list)</span></legend>
                {options.length === 0 && <p className="text-text-3">Invite the client or add subs to the job first.</p>}
                {options.map((o) => <label key={o.v} className="flex items-center gap-2"><Checkbox name="signer" value={o.v} />{o.label}<span className="text-xs text-text-3">{o.group}</span></label>)}
              </fieldset>
              <label className="flex items-center gap-2 text-[13px]"><Checkbox name="in_order" />Sign in order (each signer is asked after the previous one signs)</label>
              <Button type="submit" variant="primary">Create request</Button>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  )
}
