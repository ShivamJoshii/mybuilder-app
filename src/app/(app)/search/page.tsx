import type { Metadata } from 'next'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { getAppContext } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { JobStatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { recordHref, recordLabel } from '@/lib/records'

export const metadata: Metadata = { title: 'Search' }

/** Global search across everything the user can see (RLS scopes every query). */
export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const sp = await searchParams
  const q = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 100)
  const ctx = await getAppContext()
  const needle = q.toLowerCase()
  const jobs = q ? ctx.jobs.filter((j) => [j.title, j.street, j.city].some((v) => v?.toLowerCase().includes(needle))).slice(0, 20) : []
  let comments: { id: string; body: string; job_id: string; record_type: string; record_id: string }[] = []
  if (q && ctx.jobs.length) {
    const supabase = await createClient()
    const { data } = await supabase.from('comments').select('id,body,job_id,record_type,record_id')
      .in('job_id', ctx.jobs.map((j) => j.id)).ilike('body', `%${q.replace(/[%_]/g, '')}%`).limit(20)
    comments = data ?? []
  }
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  return (
    <>
      <PageHeader title={q ? `Results for “${q}”` : 'Search'} />
      <div className="space-y-5 p-5">
        {!q || (jobs.length === 0 && comments.length === 0) ? (
          <Card><EmptyState icon={Search} title={q ? 'Nothing found' : 'Search jobs and records'} body={q ? 'Try a different word or check the spelling.' : 'Use the search box at the top of any page.'} /></Card>
        ) : (
          <>
            {jobs.length > 0 && (
              <Card>
                <CardHeader title="Jobs" />
                <ul className="divide-y divide-border">
                  {jobs.map((j) => (
                    <li key={j.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                      <span className="size-2.5 rounded-full" style={{ background: j.color }} />
                      <Link href={`/jobs/${j.id}`} className="font-medium text-brand hover:underline">{j.title}</Link>
                      <span className="text-text-3">{[j.street, j.city].filter(Boolean).join(', ')}</span>
                      <span className="ml-auto"><JobStatusBadge status={j.status} /></span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {comments.length > 0 && (
              <Card>
                <CardHeader title="Comments" />
                <ul className="divide-y divide-border">
                  {comments.map((c) => (
                    <li key={c.id} className="px-4 py-2 text-[13px]">
                      <Link href={recordHref(c.record_type, c.job_id, c.record_id)} className="text-brand hover:underline">{recordLabel(c.record_type)} · {jobName.get(c.job_id)}</Link>
                      <p className="line-clamp-2 text-text-2">{c.body}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  )
}
