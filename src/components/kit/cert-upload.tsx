'use client'
import { Uploader } from './uploader'
import { attachCertificateFile } from '@/app/(app)/settings/compliance-actions'

export function CertUpload({ folderId, certId, path }: { folderId: string; certId: string; path: string }) {
  return <Uploader folderId={folderId} audience="none" label="Upload" accept="application/pdf,image/*" onUploaded={(ids) => attachCertificateFile(certId, ids, path)} />
}
