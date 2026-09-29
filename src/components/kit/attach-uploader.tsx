'use client'
import { Uploader } from './uploader'
import { attachFiles } from '@/app/(app)/files/actions'

export function AttachUploader({ folderId, recordType, recordId, path, share }: { folderId: string; recordType: string; recordId: string; path: string; share: { subs: boolean; clients: boolean } }) {
  return <Uploader folderId={folderId} audience="none" label="Add" onUploaded={(ids) => attachFiles(recordType, recordId, ids, share, path)} />
}
