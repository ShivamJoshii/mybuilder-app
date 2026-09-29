import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Inbox, Plus } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate, todayIn } from '@/lib/utils'
import { SUBMITTAL_KINDS, SUBMITTAL_STATUS } from '@/lib/submittal'

export const metadata: Metadata = { title: 'Submittals' }

export default async function SubmittalsPage({ searchParams }: PageProps<'/submittals'>) {
  const sp = await searchParams
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'client') redirect('/summary')
  const internal = mode === 'builder' && can(ctx, 'submittals')
  const picked = mode === 'builder' ? selectedJobs(ctx) : []
  const ball = typeof sp.ball === 'string' ? sp.ball : ''
  const supabase = await createClient()
  let q = supabase.from('submittals').select('id,number,title,spec_section,kind,status,revision,due_date,required_on_site,job_id,reviewer_user_id,sub:organizations!submittals_submitter_sub_org_id_fkey(name),jobs(title)')
    .is('deleted_at', null).order('number')
  if (internal) q = q.in('job_id', picked.map((j) => j.id))
  const { data } = internal && !picked.length ? { data: [] } : await q
  const today = todayIn(ctx.tz)
  const rows = (data ?? []).filter((s) => !ball || SUBMITTAL_STATUS[s.status].ball === ball || (ball === 'me' && s.reviewer_user_id === ctx.userId && s.status === 'submitted'))
  const canAdd = mode === 'builder' && can(ctx, 'submittals', 'add')
  return (
    <>
      <PageHeader title="Submittals" jobName={internal ? selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length) : null}
        actions={canAdd && <Button asChild variant="primary"><Link href="/submittals/new"><Plus />New submittal</Link></Button>} />
      {internal && picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="space-y-3 p-5">
        {mode === 'builder' && (
          <div className="flex flex-wrap gap-1 text-[13px]">
            {[['', 'All'], ['me', 'Waiting on my review'], ['sub', 'Ball with subs'], ['reviewer', 'In review'], ['builder', 'Drafts']].map(([k, l]) => (
              <Link key={k} href={k ? `/submittals?ball=${k}` : '/submittals'} className={`rounded-full border px-3 py-1 ${ball === k ? 'border-brand bg-brand-soft text-brand' : 'border-border text-text-2'}`}>{l}</Link>
            ))}
          </div>
        )}
        {rows.length === 0 ? (
          <EmptyState icon={Inbox} title={mode === 'sub' ? 'No submittals requested' : 'Track submittals to approval'} body={mode === 'sub' ? 'When a builder asks for shop drawings, product data or samples, they show up here.' : 'Shop drawings, product data and samples with revisions and a clear ball-in-court.'}
            action={canAdd ? <Button asChild variant="primary"><Link href="/submittals/new"><Plus />New submittal</Link></Button> : undefined} />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="w-12 px-4 py-2">#</th><th className="px-4 py-2">Title</th><th className="px-4 py-2">Spec</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Job</th>{mode === 'builder' && <th className="px-4 py-2">Sub</th>}<th className="px-4 py-2">Status</th><th className="px-4 py-2">Rev</th><th className="px-4 py-2">Due</th></tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((s) => {
                  const st = SUBMITTAL_STATUS[s.status]
                  const overdue = s.due_date && s.due_date < today && ['requested', 'revise'].includes(s.status)
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-2 text-text-3">{s.number}</td>
                      <td className="px-4 py-2"><Link href={`/submittals/${s.id}`} className="font-medium text-brand hover:underline">{s.title}</Link></td>
                      <td className="px-4 py-2 text-text-3">{s.spec_section}</td>
                      <td className="px-4 py-2">{SUBMITTAL_KINDS[s.kind]}</td>
                      <td className="px-4 py-2">{(s.jobs as { title: string } | null)?.title}</td>
                      {mode === 'builder' && <td className="px-4 py-2">{(s.sub as { name: string } | null)?.name}</td>}
                      <td className="px-4 py-2"><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className="px-4 py-2">{s.status === 'draft' || s.status === 'requested' ? '' : s.revision}</td>
                      <td className={`px-4 py-2 ${overdue ? 'font-medium text-danger' : ''}`}>{s.due_date ? formatDate(s.due_date) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  )
}
