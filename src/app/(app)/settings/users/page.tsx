import type { Metadata } from 'next'
import { Mail, UserPlus } from 'lucide-react'
import { requireBuilder, hasAction } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { fetchInternalUsers } from '@/lib/jobs'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { ActionForm } from '@/components/kit/action-form'
import { CopyButton } from '@/components/kit/copy-button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { initials, formatDate } from '@/lib/utils'
import { inviteUser, revokeInvite, updateMember } from '../actions'

export const metadata: Metadata = { title: 'Internal users' }

export default async function UsersPage() {
  const ctx = await requireBuilder('internal_users')
  const manage = hasAction(ctx, 'users.manage')
  const supabase = await createClient()
  const [users, { data: roles }, { data: invites }] = await Promise.all([
    fetchInternalUsers(ctx.workspace.orgId),
    supabase.from('roles').select('id,name,is_builtin,sort').eq('org_id', ctx.workspace.orgId).order('sort').order('name'),
    manage
      ? supabase.from('invites').select('id,email,token,created_at,expires_at,role_id').eq('org_id', ctx.workspace.orgId).eq('kind', 'internal').is('accepted_at', null).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; token: string; created_at: string; expires_at: string; role_id: string | null }[] }),
  ])
  const roleName = new Map((roles ?? []).map((r) => [r.id, r.name]))
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? ''

  return (
    <>
      <PageHeader title="Internal users" actions={manage && (
        <Dialog>
          <DialogTrigger asChild><Button variant="primary"><UserPlus />Invite user</Button></DialogTrigger>
          <DialogContent title="Invite an internal user" description="They get access based on the role you pick.">
            <ActionForm action={inviteUser} className="space-y-4 p-4">
              <Field label="Email" htmlFor="inv_email" required><Input id="inv_email" name="email" type="email" required /></Field>
              <Field label="Role" htmlFor="inv_role" required>
                <Select id="inv_role" name="role_id" required defaultValue={(roles ?? []).find((r) => r.name === 'Project Manager')?.id}>
                  {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </Field>
              <Button type="submit" variant="primary">Create invite</Button>
            </ActionForm>
          </DialogContent>
        </Dialog>
      )} />
      <div className="space-y-5 p-5">
        {manage && (invites ?? []).length > 0 && (
          <Card>
            <CardHeader title="Pending invites" description="Email sending is not connected yet. Copy the link and send it yourself." />
            <ul className="divide-y divide-border">
              {(invites ?? []).map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-[13px]">
                  <Mail className="size-4 text-text-3" />
                  <span className="font-medium">{i.email}</span>
                  <Badge>{roleName.get(i.role_id ?? '') ?? 'Role'}</Badge>
                  <span className="text-xs text-text-3">Expires {formatDate(i.expires_at)}</span>
                  <span className="ml-auto flex gap-2">
                    <CopyButton value={`${site}/invite/${i.token}`} />
                    <form action={revokeInvite.bind(null, i.id)}><Button type="submit" size="sm" variant="ghost">Revoke</Button></form>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs font-semibold text-text-2">
                <tr>
                  <th className="px-3 py-2">Name</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Job access</th>
                  <th className="px-3 py-2">Status</th>{manage && <th className="px-3 py-2"><span className="sr-only">Edit</span></th>}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar text={initials(u)} />
                        <div><div className="font-medium">{u.name}{u.user_id === ctx.userId && <span className="text-text-3"> (you)</span>}</div><div className="text-xs text-text-3">{u.email}</div></div>
                      </div>
                    </td>
                    <td className="px-3 py-2">{u.role_name}</td>
                    <td className="px-3 py-2">{u.all_jobs ? <Badge tone="brand">All jobs</Badge> : 'Assigned jobs'}</td>
                    <td className="px-3 py-2"><Badge tone={u.status === 'active' ? 'success' : 'neutral'}>{u.status}</Badge></td>
                    {manage && (
                      <td className="px-3 py-2 text-right">
                        <Dialog>
                          <DialogTrigger asChild><Button size="sm">Edit</Button></DialogTrigger>
                          <DialogContent title={`Edit ${u.name}`}>
                            <ActionForm action={updateMember.bind(null, u.user_id)} resetOnSuccess={false} className="space-y-4 p-4">
                              <Field label="Role" htmlFor={`r-${u.user_id}`}>
                                <Select id={`r-${u.user_id}`} name="role_id" defaultValue={u.role_id ?? undefined}>
                                  {(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </Select>
                              </Field>
                              <Field label="Title" htmlFor={`t-${u.user_id}`}><Input id={`t-${u.user_id}`} name="title" defaultValue={u.title ?? ''} /></Field>
                              <Field label="Status" htmlFor={`s-${u.user_id}`}>
                                <Select id={`s-${u.user_id}`} name="status" defaultValue={u.status}>
                                  <option value="active">Active — can log in</option>
                                  <option value="inactive">Inactive — login turned off</option>
                                  <option value="archived">Archived — hidden from lists</option>
                                </Select>
                              </Field>
                              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="all_jobs" defaultChecked={u.all_jobs} className="accent-brand" />Access to all jobs</label>
                              <Button type="submit" variant="primary">Save</Button>
                            </ActionForm>
                          </DialogContent>
                        </Dialog>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}
