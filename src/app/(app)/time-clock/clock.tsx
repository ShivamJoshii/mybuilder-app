'use client'
import { useEffect, useState, useTransition } from 'react'
import { LogIn, LogOut, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { clockIn, clockOut } from './actions'

function where(): Promise<{ lat: number | null; lng: number | null }> {
  return new Promise((res) => {
    if (!('geolocation' in navigator)) return res({ lat: null, lng: null })
    navigator.geolocation.getCurrentPosition((p) => res({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }), () => res({ lat: null, lng: null }), { timeout: 5000, maximumAge: 60_000 })
  })
}
const elapsed = (from: string, now: number) => { const m = Math.max(0, Math.floor((now - Date.parse(from)) / 60000)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` }

export function Clock({ open, jobs, codes, defaultJob }: {
  open: { job: string; since: string; costCode: string | null } | null
  jobs: { id: string; title: string }[]; codes: { id: string; code: string; title: string }[]; defaultJob: string
}) {
  const [job, setJob] = useState(defaultJob)
  const [code, setCode] = useState('')
  const [brk, setBrk] = useState('30')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [pending, start] = useTransition()
  useEffect(() => { if (!open) return; const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [open])

  if (open) return (
    <Card className="flex flex-wrap items-end gap-3 p-4">
      <div className="mr-auto">
        <div className="text-xs text-text-3">Clocked in</div>
        <div className="text-lg font-semibold">{jobs.find((j) => j.id === open.job)?.title ?? 'Job'} · <span className="tabular-nums" data-testid="elapsed">{elapsed(open.since, now)}</span></div>
      </div>
      <label className="text-[13px] font-medium text-text-2">Break (min)<Input className="mt-1 w-24" type="number" min="0" max="720" value={brk} onChange={(e) => setBrk(e.target.value)} /></label>
      <label className="text-[13px] font-medium text-text-2">Notes<Input className="mt-1 w-64" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></label>
      <Button variant="primary" disabled={pending} onClick={() => start(async () => {
        const r = await clockOut({ breakMinutes: Number(brk) || 0, notes, ...(await where()) })
        if (r.error) setError(r.error)
      })}><LogOut />Clock out</Button>
      {error && <Alert className="w-full">{error}</Alert>}
    </Card>
  )
  return (
    <Card className="flex flex-wrap items-end gap-3 p-4">
      <label className="text-[13px] font-medium text-text-2">Job<Select className="mt-1 w-64" value={job} onChange={(e) => setJob(e.target.value)} aria-label="Job to clock in to">
        <option value="" disabled>Pick a job</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</Select></label>
      <label className="text-[13px] font-medium text-text-2">Cost code<Select className="mt-1 w-56" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Cost code">
        <option value="">—</option>{codes.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}</Select></label>
      <Button variant="primary" disabled={pending || !job} onClick={() => start(async () => {
        const r = await clockIn({ job, costCode: code || null, ...(await where()) })
        if (r.error) setError(r.error)
      })}><LogIn />Clock in</Button>
      <span className="flex items-center gap-1 text-xs text-text-3"><MapPin className="size-3" />Location is saved if you allow it.</span>
      {error && <Alert className="w-full">{error}</Alert>}
    </Card>
  )
}
