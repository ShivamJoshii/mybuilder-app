import Link from 'next/link'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { dismissSetup } from '@/app/(app)/settings/actions'

/** First-run checklist for a new builder company; disappears when done or dismissed. */
export async function SetupChecklist({ orgId }: { orgId: string }) {
  const supabase = await createClient()
  const head = { count: 'exact' as const, head: true }
  const [{ data: org }, members, invites, subs, jobs, clients, items] = await Promise.all([
    supabase.from('organizations').select('logo_url,gst_number,setup_dismissed_at').eq('id', orgId).single(),
    supabase.from('org_members').select('user_id', head).eq('org_id', orgId),
    supabase.from('invites').select('id', head).eq('org_id', orgId).eq('kind', 'internal'),
    supabase.from('builder_sub_links').select('id', head).eq('builder_org_id', orgId),
    supabase.from('jobs').select('id', head).eq('org_id', orgId).eq('is_template', false).is('deleted_at', null),
    supabase.from('invites').select('id', head).eq('org_id', orgId).eq('kind', 'client'),
    supabase.from('schedule_items').select('id', head).eq('org_id', orgId).is('deleted_at', null),
  ])
  if (!org || org.setup_dismissed_at) return null
  const steps = [
    { done: Boolean(org.logo_url && org.gst_number), label: 'Add your logo and GST/HST number', href: '/settings/company' },
    { done: (members.count ?? 0) > 1 || (invites.count ?? 0) > 0, label: 'Invite your team', href: '/settings/users' },
    { done: (subs.count ?? 0) > 0, label: 'Add your subs and suppliers', href: '/settings/subs' },
    { done: (jobs.count ?? 0) > 0, label: 'Create your first job', href: '/jobs/new' },
    { done: (clients.count ?? 0) > 0, label: 'Invite a client to their job', href: '/jobs' },
    { done: (items.count ?? 0) > 0, label: 'Build a schedule', href: '/schedule/new' },
  ]
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null
  return (
    <Card>
      <CardHeader title="Getting started" description={`${done} of ${steps.length} done. Switching from another system? Import your jobs, leads, subs and cost codes.`}
        actions={<form action={dismissSetup}><Button type="submit" size="icon" variant="ghost" aria-label="Hide getting started"><X /></Button></form>} />
      <div className="h-1.5 bg-surface-2"><div className="h-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ul className="grid gap-x-6 p-4 text-[13px] sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2 py-1">
            {s.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-text-3" />}
            {s.done ? <span className="text-text-3 line-through">{s.label}</span> : <Link href={s.href} className="text-brand hover:underline">{s.label}</Link>}
          </li>
        ))}
        <li className="flex items-center gap-2 py-1"><Circle className="size-4 text-text-3" /><Link href="/settings/import" className="text-brand hover:underline">Import from a spreadsheet (optional)</Link></li>
      </ul>
    </Card>
  )
}
