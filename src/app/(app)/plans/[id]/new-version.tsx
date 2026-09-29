'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { openPdf } from '@/lib/pdf'
import { putFile } from '@/lib/upload'
import { finishPlanUpload, startSheetVersion } from '../actions'

export function NewVersion({ sheetId, next }: { sheetId: string; next: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [note, setNote] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function pick(f?: File) {
    setError(''); setFile(f ?? null); setPages(1); setPage(1)
    if (f?.type === 'application/pdf') {
      try { setPages((await openPdf(await f.arrayBuffer())).numPages) } catch { setError('We couldn’t read that PDF.') }
    }
  }
  async function upload() {
    if (!file) return
    setError(''); setProgress(0)
    try {
      const r = await startSheetVersion({ sheetId, file: { name: file.name, mime: file.type, size: file.size }, page, note })
      await putFile(r.url, file, file.type, setProgress)
      await finishPlanUpload(r.key, r.versionIds)
      setOpen(false); setProgress(null); setFile(null); setNote('')
      router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); setProgress(null) }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><UploadCloud />New version</Button></DialogTrigger>
      <DialogContent title={`Upload version ${next}`} description="Markups stay with the version they were drawn on.">
        <div className="space-y-3 p-4">
          {error && <Alert>{error}</Alert>}
          <label className="block text-[13px] font-medium text-text-2">File (PDF or image)
            <Input className="mt-1" type="file" aria-label="Version file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {pages > 1 && (
            <label className="block text-[13px] font-medium text-text-2">Page for this sheet
              <Select className="mt-1" value={page} onChange={(e) => setPage(Number(e.target.value))}>{Array.from({ length: pages }, (_, i) => <option key={i} value={i + 1}>Page {i + 1}</option>)}</Select>
            </label>
          )}
          <label className="block text-[13px] font-medium text-text-2">What changed?
            <Input className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Moved kitchen window 600 mm east" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" variant="primary" disabled={!file || progress !== null} onClick={upload}>{progress !== null ? `Uploading ${progress}%` : 'Upload'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
