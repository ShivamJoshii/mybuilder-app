'use client'
import { ActionForm } from './action-form'
import { Textarea } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { postComment } from '@/app/(app)/comments/actions'

export function CommentComposer({
  jobId, recordType, recordId, path, mode, canShareWithClient,
}: { jobId: string; recordType: string; recordId: string; path: string; mode: 'builder' | 'sub' | 'client'; canShareWithClient: boolean }) {
  return (
    <ActionForm action={postComment} className="border-t border-border p-4">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="record_type" value={recordType} />
      <input type="hidden" name="record_id" value={recordId} />
      <input type="hidden" name="path" value={path} />
      <Textarea name="body" aria-label="Write a comment" placeholder="Write a comment" maxLength={4000} required className="min-h-16" />
      <div className="mt-2 flex flex-wrap items-center gap-4">
        {mode === 'builder' && (
          <>
            <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" name="subs" className="accent-brand" />Share with subs</label>
            <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" name="clients" className="accent-brand" />Share with client</label>
          </>
        )}
        {mode === 'sub' && canShareWithClient && (
          <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" name="clients" className="accent-brand" />Share with client</label>
        )}
        <Button type="submit" variant="primary" size="sm" className="ml-auto">Post comment</Button>
      </div>
    </ActionForm>
  )
}
