import type { AppContext } from './context'

/** Longest job-id list we put in a URL (~4.5 KB); beyond it we filter by company instead. */
export const MAX_IN_IDS = 120

type Filterable = { in(col: string, v: readonly string[]): unknown; eq(col: string, v: string): unknown; not(col: string, op: string, v: string): unknown }

/**
 * Restrict a list query to these jobs. Large selections ("all jobs" at a busy builder) would overflow the URL
 * as an id list, so they filter by the builder's company and exclude the few jobs that aren't selected.
 * Row-level security still decides what the user may see either way.
 */
export function forJobs<Q>(q: Q, ctx: Pick<AppContext, 'workspace' | 'jobs'>, ids: readonly string[]): Q {
  const b = q as unknown as Filterable
  if (ids.length <= MAX_IN_IDS || ctx.workspace.mode !== 'builder') return b.in('job_id', ids) as Q
  const sel = new Set(ids)
  const skip = ctx.jobs.filter((j) => !sel.has(j.id)).map((j) => j.id).slice(0, MAX_IN_IDS)
  const byOrg = b.eq('org_id', ctx.workspace.orgId) as Filterable
  return (skip.length ? byOrg.not('job_id', 'in', `(${skip.join(',')})`) : byOrg) as Q
}

/** For tables without org_id: run the query per chunk of ids and concatenate the rows. */
export async function inChunks<T>(ids: readonly string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>): Promise<{ data: T[] }> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += MAX_IN_IDS) out.push(...(((await run(ids.slice(i, i + MAX_IN_IDS))).data) ?? []))
  return { data: out }
}
