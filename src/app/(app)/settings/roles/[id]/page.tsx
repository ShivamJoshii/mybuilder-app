import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Lock, Trash2 } from 'lucide-react'
import { requireBuilder, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { ActionForm } from '@/components/kit/action-form'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { saveRole, deleteRole } from '../../actions'

export const metadata: Metadata = { title: 'Role' }

const AREAS: Record<string, string> = { jobs: 'Jobs', sales: 'Sales', project: 'Project management', files: 'Files', messaging: 'Messaging', financial: 'Financial', admin: 'Company' }

export default async function RolePage({ params }: PageProps<'/settings/roles/[id]'>) {
  const { id } = await params
  const ctx = await requireBuilder('internal_users')
  const supabase = await createClient()
  const [{ data: role }, { data: modules }, { data: perms }, { data: actions }, { data: roleActions }] = await Promise.all([
    supabase.from('roles').select('*').eq('id', id).eq('org_id', ctx.workspace.orgId).maybeSingle(),
    supabase.from('app_modules').select('*').order('sort'),
    supabase.from('role_permissions').select('*').eq('role_id', id),
    supabase.from('app_actions').select('*').order('module'),
    supabase.from('role_actions').select('action').eq('role_id', id),
  ])
  if (!role) notFound()
  const editable = !role.is_builtin && hasAction(ctx, 'users.manage')
  const pmap = new Map((perms ?? []).map((p) => [p.module, p]))
  const acts = new Set((roleActions ?? []).map((a) => a.action))
  const dis = !editable

  const box = (name: string, on: boolean | undefined, label: string) => (
    <input type="checkbox" name={name} defaultChecked={Boolean(on)} disabled={dis} aria-label={label} className="size-4 accent-brand" />
  )

  const grid = (
    <Card>
      <CardHeader title="Permissions by module" description="View is required for anything else. Scope limits records to all jobs, assigned jobs, or the user's own records." />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-xs font-semibold text-text-2">
            <tr>
              <th className="px-3 py-2 text-left">Module</th>
              {['View', 'Add', 'Edit', 'Delete', 'Cost', 'Price'].map((h) => <th key={h} className="px-2 py-2 text-center">{h}</th>)}
              <th className="px-3 py-2 text-left">Scope</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(AREAS).map((area) => {
              const mods = (modules ?? []).filter((m) => m.area === area)
              if (mods.length === 0) return null
              return [
                <tr key={area} className="border-t border-border bg-surface-2/50"><td colSpan={8} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-3">{AREAS[area]}</td></tr>,
                ...mods.map((m) => {
                  const p = pmap.get(m.key)
                  return (
                    <tr key={m.key} className="border-t border-border">
                      <td className="px-3 py-1.5">{m.label}</td>
                      <td className="px-2 text-center">{box(`${m.key}.view`, p?.can_view, `${m.label} view`)}</td>
                      <td className="px-2 text-center">{box(`${m.key}.add`, p?.can_add, `${m.label} add`)}</td>
                      <td className="px-2 text-center">{box(`${m.key}.edit`, p?.can_edit, `${m.label} edit`)}</td>
                      <td className="px-2 text-center">{box(`${m.key}.delete`, p?.can_delete, `${m.label} delete`)}</td>
                      <td className="px-2 text-center">{m.has_money ? box(`${m.key}.cost`, p?.see_cost, `${m.label} see cost`) : null}</td>
                      <td className="px-2 text-center">{m.has_money ? box(`${m.key}.price`, p?.see_price, `${m.label} see price`) : null}</td>
                      <td className="px-3 py-1">
                        <select name={`${m.key}.scope`} defaultValue={p?.scope ?? 'assigned'} disabled={dis} aria-label={`${m.label} scope`}
                          className="h-7 rounded border border-border-strong bg-surface px-1 text-xs disabled:bg-surface-2">
                          <option value="all">All jobs</option>
                          <option value="assigned">Assigned jobs</option>
                          <option value="own">Own records</option>
                        </select>
                      </td>
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )

  const body = (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Role" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={role.name} disabled={dis} required /></Field>
          <Field label="Job statuses this role can see">
            <div className="flex flex-wrap gap-3 pt-1.5 text-[13px]">
              {['presale', 'open', 'warranty', 'closed'].map((s) => (
                <label key={s} className="flex items-center gap-1.5 capitalize">
                  <input type="checkbox" name="allowed_job_statuses" value={s} defaultChecked={role.allowed_job_statuses.includes(s as never)} disabled={dis} className="accent-brand" />{s}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Description" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" defaultValue={role.description} disabled={dis} className="min-h-14" /></Field>
          <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
            <input type="checkbox" name="all_jobs_default" defaultChecked={role.all_jobs_default} disabled={dis} className="accent-brand" />
            New users with this role get access to all jobs
          </label>
        </div>
      </Card>
      {grid}
      <Card>
        <CardHeader title="Special permissions" />
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {(actions ?? []).map((a) => (
            <label key={a.key} className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" name="actions" value={a.key} defaultChecked={acts.has(a.key)} disabled={dis} className="accent-brand" />{a.label}
            </label>
          ))}
        </div>
      </Card>
    </div>
  )

  return (
    <>
      <PageHeader title={role.name} actions={<>
        <Button asChild variant="ghost"><Link href="/settings/roles"><ArrowLeft />All roles</Link></Button>
        {editable && (
          <form action={deleteRole.bind(null, role.id)}>
            <ConfirmSubmit variant="ghost" title="Delete this role?" body="Only possible when no users have this role."><Trash2 />Delete</ConfirmSubmit>
          </form>
        )}
      </>} />
      <div className="max-w-5xl p-5">
        {role.is_builtin && (
          <Alert tone="info" className="mb-4 flex items-center gap-2">
            <Lock className="inline size-4" /> Built-in roles can’t be changed. Use “New custom role” to copy it and adjust.
          </Alert>
        )}
        {editable ? (
          <ActionForm action={saveRole.bind(null, role.id)} resetOnSuccess={false}>
            {body}
            <div className="sticky bottom-0 mt-5 flex justify-end border-t border-border bg-bg py-3">
              <Button type="submit" variant="primary">Save role</Button>
            </div>
          </ActionForm>
        ) : body}
      </div>
    </>
  )
}
