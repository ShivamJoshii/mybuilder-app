'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { disciplineFor, guessSheetNumber, openPdf } from '@/lib/pdf'
import { putFile } from '@/lib/upload'
import { finishPlanUpload, startPlanSet } from '../actions'

type Page = { page: number; number: string; title: string; discipline: string }

export function PlanSetUploader({ jobs, defaultJob }: { jobs: { id: string; title: string }[]; defaultJob: string }) {
  const router = useRouter()
  const [jobId, setJobId] = useState(defaultJob)
  const [file, setFile] = useState<File | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [shareSubs, setShareSubs] = useState(false)
  const [shareClients, setShareClients] = useState(false)

  async function pick(f: File | undefined) {
    setError(''); setPages([]); setFile(f ?? null)
    if (!f) return
    if (f.type === 'application/pdf') {
      setReading(true)
      try {
        const doc = await openPdf(await f.arrayBuffer())
        const out: Page[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          const n = (await guessSheetNumber(doc, i)) ?? `S${String(i).padStart(2, '0')}`
          out.push({ page: i, number: n, title: '', discipline: disciplineFor(n) })
        }
        setPages(out)
      } catch {
        setError('We couldn’t read that PDF. Check that it isn’t password-protected.')
      } finally { setReading(false) }
    } else if (['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
      setPages([{ page: 1, number: 'S01', title: f.name.replace(/\.[^.]+$/, ''), discipline: '' }])
    } else setError('Upload a PDF or an image (PNG, JPG, WebP).')
  }

  const set = (i: number, patch: Partial<Page>) => setPages((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  async function upload() {
    if (!file || !jobId) return
    setError(''); setProgress(0)
    try {
      const r = await startPlanSet({ jobId, file: { name: file.name, mime: file.type, size: file.size }, pages, shareSubs, shareClients })
      await putFile(r.url, file, file.type, setProgress)
      await finishPlanUpload(r.key, r.versionIds)
      router.push('/plans')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed'); setProgress(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <label className="text-[13px] font-medium text-text-2">Job
          <Select className="mt-1" value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label="Job">
            <option value="" disabled>Pick a job</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </Select>
        </label>
        <label className="text-[13px] font-medium text-text-2">Plan set (PDF or image)
          <Input className="mt-1" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" aria-label="Plan file" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <div className="space-y-1.5 text-[13px] text-text-2 sm:col-span-2">
          <label className="flex items-center gap-2"><Checkbox checked={shareSubs} onChange={(e) => setShareSubs(e.target.checked)} /> Share with subs on the job</label>
          <label className="flex items-center gap-2"><Checkbox checked={shareClients} onChange={(e) => setShareClients(e.target.checked)} /> Share with the client</label>
        </div>
      </Card>
      {reading && <p className="text-[13px] text-text-3">Reading the pages…</p>}
      {pages.length > 0 && (
        <Card className="overflow-x-auto">
          <div className="border-b border-border px-4 py-2 text-[13px] text-text-2">{pages.length} {pages.length === 1 ? 'sheet' : 'sheets'} found. Check the numbers we read from the title blocks.</div>
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs text-text-3"><tr><th className="px-4 py-2">Page</th><th className="px-2 py-2">Sheet number</th><th className="px-2 py-2">Title</th><th className="px-2 py-2">Discipline</th></tr></thead>
            <tbody>
              {pages.map((p, i) => (
                <tr key={p.page} className="border-t border-border">
                  <td className="px-4 py-1 text-text-3">{p.page}</td>
                  <td className="px-2 py-1"><Input aria-label={`Sheet number, page ${p.page}`} className="h-8 w-28" value={p.number} maxLength={30} onChange={(e) => set(i, { number: e.target.value, discipline: p.discipline || disciplineFor(e.target.value) })} /></td>
                  <td className="px-2 py-1"><Input aria-label={`Title, page ${p.page}`} className="h-8" value={p.title} maxLength={200} onChange={(e) => set(i, { title: e.target.value })} /></td>
                  <td className="px-2 py-1"><Input aria-label={`Discipline, page ${p.page}`} className="h-8 w-40" value={p.discipline} maxLength={40} onChange={(e) => set(i, { discipline: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={upload} disabled={!file || !jobId || !pages.length || progress !== null || pages.some((p) => !p.number.trim())}>
          <UploadCloud />{progress !== null ? `Uploading ${progress}%` : 'Upload plans'}
        </Button>
      </div>
    </div>
  )
}
