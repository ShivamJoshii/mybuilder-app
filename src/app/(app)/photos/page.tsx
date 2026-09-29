import type { Metadata } from 'next'
import { FilesPage } from '../files/files-page'

export const metadata: Metadata = { title: 'Photos' }

export default async function PhotosPage({ searchParams }: PageProps<'/photos'>) {
  return <FilesPage kind="photos" sp={await searchParams} />
}
