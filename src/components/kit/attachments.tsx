import { Paperclip, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AttachUploader } from './attach-uploader'
import { detachFile } from '@/app/(app)/files/actions'

/** Files attached to a record. Uploads land in the job's Attachments folder. */
export async function Attachments({ jobId, recordType, recordId, path, share, canAdd = true }: {
  jobId: string; recordType: string; recordId: string; path: string; share: { subs: boolean; clients: boolean }; canAdd?: boolean
}) {
  const supabase = await createClient()
  const [{ data: links }, { data: folder }] = await Promise.all([
    supabase.from('record_attachments').select('file_id,created_by,files(id,name,size_bytes,mime,status,deleted_at)').eq('record_type', recordType).eq('record_id', recordId),
    supabase.from('file_folders').select('id').eq('job_id', jobId).eq('system_key', 'attachments').maybeSingle(),
  ])
  type F = { id: string; name: string; size_bytes: number; mime: string; status: string; deleted_at: string | null }
  const files = (links ?? []).map((l) => ({ ...(l.files as unknown as F), created_by: l.created_by })).filter((f) => f.id && f.status === 'ready' && !f.deleted_at)
  return (
    <Card>
      <CardHeader title="Attachments" actions={canAdd && folder ? <AttachUploader folderId={folder.id} recordType={recordType} recordId={recordId} path={path} share={share} /> : undefined} />
      {files.length === 0 ? <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-text-3"><Paperclip className="size-4" />No attachments.</p> : (
        <ul className="divide-y divide-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
              {f.mime.startsWith('image/')
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/files/${f.id}/download?inline=1`} alt="" className="size-10 rounded object-cover" />
                : <Paperclip className="size-4 text-text-3" />}
              <a href={`/files/${f.id}/download?inline=1`} target="_blank" rel="noreferrer" className="flex-1 truncate text-brand hover:underline">{f.name}</a>
              <span className="text-xs text-text-3">{Math.max(1, Math.round(f.size_bytes / 1024))} KB</span>
              {canAdd && <form action={detachFile.bind(null, recordType, recordId, f.id, path)}><Button type="submit" size="icon" variant="ghost" aria-label={`Remove ${f.name}`}><X /></Button></form>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
