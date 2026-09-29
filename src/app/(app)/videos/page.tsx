import type { Metadata } from 'next'
import { FilesPage } from '../files/files-page'

export const metadata: Metadata = { title: 'Videos' }

export default async function VideosPage({ searchParams }: PageProps<'/videos'>) {
  return <FilesPage kind="videos" sp={await searchParams} />
}
