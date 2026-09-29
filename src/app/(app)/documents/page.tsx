import type { Metadata } from 'next'
import { FilesPage } from '../files/files-page'

export const metadata: Metadata = { title: 'Documents' }

export default async function DocumentsPage({ searchParams }: PageProps<'/documents'>) {
  return <FilesPage kind="documents" sp={await searchParams} />
}
