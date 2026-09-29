import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireBuilder, can } from '@/lib/context'
import { PageHeader } from '@/components/shell/page-header'
import { IMPORTERS, type ImportKind } from '@/lib/importers'
import { Importer } from './importer'

export const metadata: Metadata = { title: 'Import data' }

export default async function ImportPage() {
  const ctx = await requireBuilder()
  const kinds = (Object.keys(IMPORTERS) as ImportKind[]).filter((k) => can(ctx, IMPORTERS[k].module, 'add'))
  if (!kinds.length) redirect('/settings/profile')
  return (
    <>
      <PageHeader title="Import data" />
      <div className="max-w-5xl p-5"><Importer kinds={kinds} /></div>
    </>
  )
}
