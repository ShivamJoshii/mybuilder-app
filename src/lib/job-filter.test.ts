import { describe, expect, it } from 'vitest'
import { forJobs } from './job-filter'

const rec = () => {
  const calls: string[] = []
  const b = { in: (c: string, v: readonly string[]) => (calls.push(`in ${c} ${v.length}`), b), eq: (c: string, v: string) => (calls.push(`eq ${c} ${v}`), b), not: (c: string, o: string, v: string) => (calls.push(`not ${c} ${o} ${v.split(',').length}`), b) }
  return { b, calls }
}
const jobs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `j${i}` }))

describe('forJobs', () => {
  it('uses an id list for normal selections', () => {
    const { b, calls } = rec()
    forJobs(b, { workspace: { mode: 'builder', orgId: 'o', orgName: '', roleName: null }, jobs: jobs(10) as never }, ['j1', 'j2'])
    expect(calls).toEqual(['in job_id 2'])
  })
  it('filters by company for big selections, excluding unselected jobs', () => {
    const { b, calls } = rec()
    const all = jobs(400)
    forJobs(b, { workspace: { mode: 'builder', orgId: 'o', orgName: '', roleName: null }, jobs: all as never }, all.slice(0, 390).map((j) => j.id))
    expect(calls).toEqual(['eq org_id o', 'not job_id in 10'])
  })
})
