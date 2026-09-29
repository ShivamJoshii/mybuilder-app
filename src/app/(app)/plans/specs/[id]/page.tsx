import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { getAppContext, can } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmSubmit } from '@/components/kit/confirm-submit'
import { PrintButton } from '@/components/kit/print-button'
import { formatDate } from '@/lib/utils'
import { SpecBody, SpecForm } from '../spec-form'
import { deleteSpec, updateSpec } from '../../actions'

export const metadata: Metadata = { title: 'Specification' }

export default async function SpecPage({ params }: PageProps<'/plans/specs/[id]'>) {
  const { id } = await params
  const ctx = await getAppContext()
  const supabase = await createClient()
  const { data: s } = await supabase.from('spec_documents').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!s) notFound()
  const builder = ctx.workspace.mode === 'builder'
  const canEdit = builder && can(ctx, 'specs', 'edit')
  const job = ctx.jobs.find((j) => j.id === s.job_id)
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-5">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost"><Link href="/plans?tab=specs"><ArrowLeft />Specifications</Link></Button>
        <div className="flex gap-2">
          <PrintButton />
          {builder && can(ctx, 'specs', 'delete') && <form action={deleteSpec.bind(null, id)}><ConfirmSubmit variant="ghost" title="Delete this specification?" body="It moves to the trash."><Trash2 />Delete</ConfirmSubmit></form>}
        </div>
      </div>
      {canEdit ? (
        <Card className="p-5 print:hidden">
          <SpecForm action={updateSpec.bind(null, id)} jobs={job ? [job] : []} submitLabel="Save specification"
            defaults={{ job_id: s.job_id, division: s.division ?? '', title: s.title, body: s.body, share_subs: s.share_subs, share_clients: s.share_clients }} />
        </Card>
      ) : null}
      <Card className={`p-6 ${canEdit ? 'hidden print:block' : ''}`}>
        <div className="text-[13px] text-text-3">{job?.title}{s.division ? ` · ${s.division}` : ''} · Updated {formatDate(s.updated_at)}</div>
        <h1 className="mb-4 text-xl font-semibold">{s.title}</h1>
        <SpecBody text={s.body} />
      </Card>
    </div>
  )
}
