import type { Metadata } from 'next'
import Link from 'next/link'
import { Copy, Lock } from 'lucide-react'
import { requireBuilder, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { cloneRole } from '../actions'

export const metadata: Metadata = { title: 'Roles and permissions' }

export default async function RolesPage() {
  const ctx = await requireBuilder('internal_users')
  const manage = hasAction(ctx, 'users.manage')
  const supabase = await createClient()
  const [{ data: roles }, { data: members }] = await Promise.all([
    supabase.from('roles').select('id,name,description,is_builtin,allowed_job_statuses,sort').eq('org_id', ctx.workspace.orgId).order('is_builtin', { ascending: false }).order('sort').order('name'),
    supabase.from('org_members').select('role_id').eq('org_id', ctx.workspace.orgId).eq('status', 'active'),
  ])
  const counts = new Map<string, number>()
  for (const m of members ?? []) counts.set(m.role_id!, (counts.get(m.role_id!) ?? 0) + 1)

  return (
    <>
      <PageHeader title="Roles and permissions" actions={manage && (
        <Dialog>
          <DialogTrigger asChild><Button variant="primary"><Copy />New custom role</Button></DialogTrigger>
          <DialogContent title="New custom role" description="Start from an existing role, then adjust its permissions.">
            <ActionForm action={cloneRole} className="space-y-4 p-4">
              <Field label="Copy from" htmlFor="role_id">
                <Select id="role_id" name="role_id">{(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
              </Field>
              <Field label="New role name" htmlFor="name" required><Input id="name" name="name" required maxLength={60} /></Field>
              <Button type="submit" variant="primary">Create role</Button>
            </ActionForm>
          </DialogContent>
        </Dialog>
      )} />
      <div className="p-5">
        <Card>
          <ul className="divide-y divide-border">
            {(roles ?? []).map((r) => (
              <li key={r.id}>
                <Link href={`/settings/roles/${r.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
                  {r.is_builtin ? <Lock className="mt-0.5 size-4 text-text-3" /> : <span className="mt-0.5 size-4" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      {r.name}{r.is_builtin ? <Badge>Built-in</Badge> : <Badge tone="brand">Custom</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-text-3">{r.description}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-text-3">
                    <div>{counts.get(r.id) ?? 0} {(counts.get(r.id) ?? 0) === 1 ? 'user' : 'users'}</div>
                    <div className="capitalize">{r.allowed_job_statuses.join(', ')}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
