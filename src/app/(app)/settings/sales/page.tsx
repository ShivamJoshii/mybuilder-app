import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Lock, Trash2 } from 'lucide-react'
import { requireBuilder, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchLookups } from '@/lib/leads'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { CopyButton } from '@/components/kit/copy-button'
import { addListItem, deleteListItem, renameListItem, addForm, toggleForm } from './actions'

export const metadata: Metadata = { title: 'Sales settings' }

function List({ kind, title, items }: { kind: 'status' | 'source' | 'type' | 'lost'; title: string; items: { id: string; name: string; color?: string; category?: string; is_system?: boolean }[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <ul className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 px-4 py-1.5">
            {i.color && <span className="size-2.5 rounded-full" style={{ background: i.color }} />}
            <ActionForm action={renameListItem.bind(null, kind, i.id)} resetOnSuccess={false} className="flex flex-1 items-center gap-2">
              <Input name="name" defaultValue={i.name} aria-label={`Rename ${i.name}`} className="h-7 flex-1" maxLength={40} />
              <Button type="submit" size="sm" variant="ghost">Save</Button>
            </ActionForm>
            {i.category && i.category !== 'open' && <Badge>{i.category}</Badge>}
            {i.is_system ? <Lock className="size-4 text-text-3" aria-label="Locked" /> : (
              <form action={deleteListItem.bind(null, kind, i.id)}><Button type="submit" size="icon" variant="ghost" aria-label={`Delete ${i.name}`}><Trash2 /></Button></form>
            )}
          </li>
        ))}
      </ul>
      <ActionForm action={addListItem.bind(null, kind)} className="flex gap-2 border-t border-border p-3">
        <Input name="name" placeholder="Add…" aria-label={`Add to ${title}`} maxLength={40} required />
        {kind === 'status' && <input type="color" name="color" defaultValue="#0ea5e9" aria-label="Colour" className="h-8 w-10 rounded border border-border-strong" />}
        <Button type="submit">Add</Button>
      </ActionForm>
    </Card>
  )
}

export default async function SalesSettingsPage() {
  const ctx = await requireBuilder()
  if (!hasAction(ctx, 'settings.manage')) redirect('/settings/profile')
  const l = await fetchLookups(ctx.workspace.orgId)
  const supabase = await createClient()
  const { data: forms } = await supabase.from('lead_forms').select('*').eq('org_id', ctx.workspace.orgId).order('created_at')
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? ''

  return (
    <>
      <PageHeader title="Sales" />
      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <List kind="status" title="Lead statuses" items={l.statuses} />
        <List kind="source" title="Lead sources" items={l.sources} />
        <List kind="type" title="Project types" items={l.types} />
        <List kind="lost" title="Lost reasons" items={l.lostReasons} />
        <Card className="lg:col-span-2">
          <CardHeader title="Website lead forms" description="Put a form on your website. Enquiries become leads and notify your sales team." />
          <ul className="divide-y divide-border">
            {(forms ?? []).map((f) => {
              const url = `${site}/f/${f.token}`
              return (
                <li key={f.id} className="space-y-2 px-4 py-3 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{f.name}</span>
                    <Badge tone={f.is_active ? 'success' : 'neutral'}>{f.is_active ? 'Live' : 'Off'}</Badge>
                    <span className="ml-auto flex gap-2">
                      <CopyButton value={url} label="Copy link" />
                      <CopyButton value={`<iframe src="${url}?embed=1" style="width:100%;min-height:560px;border:0" title="${f.name}"></iframe>`} label="Copy embed code" />
                      <form action={toggleForm.bind(null, f.id, !f.is_active)}><Button type="submit" size="sm" variant="ghost">{f.is_active ? 'Turn off' : 'Turn on'}</Button></form>
                    </span>
                  </div>
                  <code className="block truncate rounded bg-surface-2 px-2 py-1 text-xs text-text-2">{url}</code>
                </li>
              )
            })}
            {(forms ?? []).length === 0 && <li className="px-4 py-3 text-[13px] text-text-3">No forms yet.</li>}
          </ul>
          <ActionForm action={addForm} className="flex flex-wrap gap-2 border-t border-border p-3">
            <Input name="name" placeholder="Form name, e.g. Website contact" aria-label="Form name" className="flex-1" required />
            <Select name="default_source_id" aria-label="Source" className="w-48"><option value="">No source</option>{l.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <Button type="submit" variant="primary">Create form</Button>
          </ActionForm>
        </Card>
      </div>
    </>
  )
}
