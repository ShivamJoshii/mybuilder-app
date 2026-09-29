import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileText, Plus, ScrollText, UploadCloud } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Plans and specs' }

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export default async function PlansPage({ searchParams }: PageProps<'/plans'>) {
  const sp = await searchParams
  const tab = sp.tab === 'specs' ? 'specs' : 'sheets'
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'builder' && !can(ctx, 'specs')) redirect('/summary?denied=specs')
  const picked = mode === 'client' ? ctx.jobs : selectedJobs(ctx)
  const ids = picked.map((j) => j.id)
  const supabase = await createClient()
  const [{ data: sheets }, { data: specs }] = ids.length ? await Promise.all([
    supabase.from('plan_sheets').select('id,job_id,number,title,discipline,current_version,share_subs,share_clients,created_at').in('job_id', ids).is('deleted_at', null),
    supabase.from('spec_documents').select('id,job_id,division,title,share_subs,share_clients,updated_at').in('job_id', ids).is('deleted_at', null).order('division').order('title'),
  ]) : [{ data: [] }, { data: [] }]
  const canAdd = mode === 'builder' && can(ctx, 'specs', 'add')
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  const groups = new Map<string, NonNullable<typeof sheets>>()
  for (const s of [...(sheets ?? [])].sort((a, b) => natural.compare(a.number, b.number))) {
    const k = s.discipline || 'Other'
    groups.set(k, [...(groups.get(k) ?? []), s])
  }

  return (
    <>
      <PageHeader title="Plans and specs" jobName={mode !== 'client' ? selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length) : null} actions={canAdd && (tab === 'sheets'
        ? <Button asChild variant="primary"><Link href="/plans/upload"><UploadCloud />Upload plans</Link></Button>
        : <Button asChild variant="primary"><Link href="/plans/specs/new"><Plus />New specification</Link></Button>)}>
        <nav className="mt-3 flex gap-4 text-[13px]">
          {[['sheets', `Plan sheets (${sheets?.length ?? 0})`], ['specs', `Specifications (${specs?.length ?? 0})`]].map(([k, l]) => (
            <Link key={k} href={k === 'sheets' ? '/plans' : '/plans?tab=specs'} className={`-mb-3 border-b-2 pb-2 ${tab === k ? 'border-brand font-medium text-brand' : 'border-transparent text-text-2'}`}>{l}</Link>
          ))}
        </nav>
      </PageHeader>
      {mode !== 'client' && picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="space-y-4 p-5">
        {tab === 'sheets' && (groups.size === 0 ? (
          <EmptyState icon={ScrollText} title="Share the latest plans" body="Upload a plan set PDF. We split it into sheets, read the sheet numbers, and keep every version for comparison and markup."
            action={canAdd ? <Button asChild variant="primary"><Link href="/plans/upload"><UploadCloud />Upload plans</Link></Button> : undefined} />
        ) : [...groups.entries()].map(([disc, list]) => (
          <Card key={disc} className="overflow-hidden">
            <div className="border-b border-border bg-surface-2 px-4 py-2 text-[13px] font-medium">{disc}</div>
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-border">
                {list.map((s) => (
                  <tr key={s.id}>
                    <td className="w-28 px-4 py-2"><Link href={`/plans/${s.id}`} className="font-medium text-brand hover:underline">{s.number}</Link></td>
                    <td className="px-4 py-2">{s.title}</td>
                    {picked.length > 1 && <td className="px-4 py-2 text-text-3">{jobName.get(s.job_id)}</td>}
                    <td className="px-4 py-2"><Badge>v{s.current_version}</Badge></td>
                    <td className="px-4 py-2 text-right">
                      {mode === 'builder' && <span className="inline-flex gap-1">{s.share_subs && <Badge>Subs</Badge>}{s.share_clients && <Badge>Client</Badge>}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )))}
        {tab === 'specs' && ((specs ?? []).length === 0 ? (
          <EmptyState icon={FileText} title="Publish specifications" body="Write finish schedules and product specs, then share them with your trades and client."
            action={canAdd ? <Button asChild variant="primary"><Link href="/plans/specs/new"><Plus />New specification</Link></Button> : undefined} />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="px-4 py-2">Title</th><th className="px-4 py-2">Division</th><th className="px-4 py-2">Job</th><th className="px-4 py-2">Updated</th><th /></tr></thead>
              <tbody className="divide-y divide-border">
                {(specs ?? []).map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2"><Link href={`/plans/specs/${s.id}`} className="font-medium text-brand hover:underline">{s.title}</Link></td>
                    <td className="px-4 py-2">{s.division}</td>
                    <td className="px-4 py-2">{jobName.get(s.job_id)}</td>
                    <td className="px-4 py-2">{formatDate(s.updated_at)}</td>
                    <td className="px-4 py-2 text-right">{mode === 'builder' && <span className="inline-flex gap-1">{s.share_subs && <Badge>Subs</Badge>}{s.share_clients && <Badge>Client</Badge>}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </>
  )
}
