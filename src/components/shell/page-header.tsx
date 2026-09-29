import Link from 'next/link'
import { Info } from 'lucide-react'

export function PageHeader({
  title, jobName, jobHref, actions, children,
}: {
  title: string
  jobName?: string | null
  jobHref?: string
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="border-b border-border bg-surface px-5 pb-3 pt-4">
      {jobName && (
        <div className="mb-0.5 text-[13px] text-text-3">
          {jobHref ? <Link href={jobHref} className="hover:text-brand hover:underline">{jobName}</Link> : jobName}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function NoJobBanner() {
  return (
    <div className="m-5 flex items-center gap-2 rounded-md border border-brand/20 bg-brand-soft px-3 py-2 text-[13px] text-brand">
      <Info className="size-4" /> No job selected. Pick a job from the list on the left.
    </div>
  )
}

/** Name to show under the title for the current job selection. */
export function selectionLabel(jobs: { title: string }[], all: boolean, total: number) {
  if (all) return `All jobs (${total})`
  if (jobs.length === 0) return null
  if (jobs.length === 1) return jobs[0].title
  return `${jobs.length} jobs selected`
}
