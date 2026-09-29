import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Construction } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { MODULE_BY_SLUG } from '@/lib/modules'
import { PageHeader, NoJobBanner, selectionLabel } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'

export async function generateMetadata({ params }: PageProps<'/[module]'>): Promise<Metadata> {
  const { module } = await params
  return { title: MODULE_BY_SLUG.get(module)?.label ?? 'Not found' }
}

/** Modules not yet built: real route, real permission + job scoping, placeholder body. */
export default async function ModulePage({ params }: PageProps<'/[module]'>) {
  const { module } = await params
  const def = MODULE_BY_SLUG.get(module)
  if (!def) notFound()
  const ctx = await getAppContext()
  if (!def.modes.includes(ctx.workspace.mode)) notFound()
  if (ctx.workspace.mode === 'builder' && !can(ctx, def.module)) redirect(`/summary?denied=${def.module}`)

  const picked = selectedJobs(ctx)
  const label = def.jobScoped ? selectionLabel(picked, ctx.selection.allJobs, ctx.jobs.length) : null

  return (
    <>
      <PageHeader title={def.label} jobName={label} jobHref={picked.length === 1 ? `/jobs/${picked[0].id}` : undefined} />
      {def.jobScoped && picked.length === 0 && ctx.jobs.length > 0 && <NoJobBanner />}
      <div className="p-5">
        <Card>
          <EmptyState icon={def.icon} title={def.emptyTitle} body={def.emptyBody}
            action={<Badge tone="neutral"><Construction className="mr-1 size-3" />Coming in build step {def.buildStep}</Badge>} />
        </Card>
      </div>
    </>
  )
}
