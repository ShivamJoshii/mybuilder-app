'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/alert'
import { startUpload, finishUpload } from '@/app/(app)/files/actions'
import { putFile } from '@/lib/upload'

type Item = { name: string; size: number; progress: number; error?: string; done?: boolean }

const put = (url: string, file: File, onProgress: (p: number) => void) => putFile(url, file, file.type, onProgress)

/**
 * Upload modal used everywhere attachments exist: drag-drop or browse, viewing
 * permissions per audience, then Upload / Cancel. Files go straight to storage.
 */
export function Uploader({
  folderId, accept, audience = 'builder', replaceFileId, label = 'Upload', onUploaded,
}: {
  folderId: string
  accept?: string
  audience?: 'builder' | 'none'
  replaceFileId?: string
  label?: string
  onUploaded?: (ids: string[]) => void
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [subs, setSubs] = useState(false)
  const [clients, setClients] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)

  const pick = (list: FileList | null) => {
    if (!list) return
    const next = replaceFileId ? [list[0]] : [...files, ...Array.from(list)]
    setFiles(next)
    setItems(next.map((f) => ({ name: f.name, size: f.size, progress: 0 })))
  }

  async function upload() {
    setBusy(true)
    const ids: string[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const set = (patch: Partial<Item>) => setItems((cur) => cur.map((x, j) => (j === i ? { ...x, ...patch } : x)))
      try {
        const s = await startUpload({ folderId, name: f.name, mime: f.type, size: f.size, shareSubs: subs, shareClients: clients, replaceFileId })
        await put(s.url, f, (p) => set({ progress: p }))
        await finishUpload(s.fileId, s.version, s.key, f.name)
        set({ progress: 100, done: true })
        ids.push(s.fileId)
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Upload failed' })
      }
    }
    setBusy(false)
    onUploaded?.(ids)
    router.refresh()
    if (ids.length === files.length) { setOpen(false); setFiles([]); setItems([]) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { setOpen(o); if (!o) { setFiles([]); setItems([]) } } }}>
      <DialogTrigger asChild><Button variant={replaceFileId ? 'ghost' : 'primary'} size={replaceFileId ? 'sm' : 'md'}><UploadCloud />{label}</Button></DialogTrigger>
      <DialogContent title={replaceFileId ? 'Upload a new version' : 'Upload files'} description={replaceFileId ? 'The current file is kept in version history.' : undefined}>
        <div className="space-y-4 p-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files) }}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center text-[13px] ${drag ? 'border-brand bg-brand-soft' : 'border-border-strong'}`}
          >
            <UploadCloud className="mb-2 size-8 text-text-3" />
            <p>Drag files here or</p>
            <Button type="button" size="sm" className="mt-2" onClick={() => input.current?.click()}>Browse</Button>
            <input ref={input} type="file" multiple={!replaceFileId} accept={accept} className="hidden" aria-label="Choose files" onChange={(e) => pick(e.target.files)} />
            <p className="mt-2 text-xs text-text-3">Up to 500 MB per file</p>
          </div>
          {items.length > 0 && (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto text-[13px]">
              {items.map((it, i) => (
                <li key={i}>
                  <div className="flex justify-between gap-2"><span className="truncate">{it.name}</span><span className="shrink-0 text-xs text-text-3">{(it.size / 1024 / 1024).toFixed(1)} MB</span></div>
                  <div className="mt-0.5 h-1.5 rounded bg-surface-2"><div className={`h-1.5 rounded ${it.error ? 'bg-danger' : 'bg-brand'}`} style={{ width: `${it.error ? 100 : it.progress}%` }} /></div>
                  {it.error && <p className="text-xs text-danger">{it.error}</p>}
                </li>
              ))}
            </ul>
          )}
          {audience === 'builder' && !replaceFileId && (
            <fieldset className="space-y-1 text-[13px]">
              <legend className="mb-1 text-xs font-medium text-text-3">Viewing permissions</legend>
              <label className="flex items-center gap-2"><input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} className="accent-brand" />Subs and vendors can view</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={clients} onChange={(e) => setClients(e.target.checked)} className="accent-brand" />Client can view</label>
            </fieldset>
          )}
          {items.some((x) => x.error) && <Alert>Some files didn’t upload. You can try them again.</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" variant="primary" disabled={busy || files.length === 0} onClick={upload}>{busy ? 'Uploading…' : 'Upload'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
