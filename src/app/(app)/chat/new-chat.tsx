'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { chatDirectory, startChat } from './actions'

type Person = { user_id: string; name: string; email: string; kind: string; company: string | null }

export function NewChat({ builders, jobs }: { builders: { id: string; name: string }[]; jobs: { id: string; title: string; org_id: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [org, setOrg] = useState(builders[0]?.id ?? '')
  const [job, setJob] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    if (!open || !org) return
    let live = true
    chatDirectory(org, job || null).then((d) => { if (live) { setPeople(d as Person[]); setPicked((p) => p.filter((x) => (d as Person[]).some((y) => y.user_id === x))) } })
    return () => { live = false }
  }, [open, org, job])

  const go = () => start(async () => {
    const r = await startChat({ org, job: job || null, users: picked, title, body })
    if (r.error) { setError(r.error); return }
    setOpen(false); setPicked([]); setBody(''); setTitle('')
    router.push(`/chat?c=${r.id}`)
  })
  const groups: [string, string][] = [['team', 'Team'], ['sub', 'Subs and vendors'], ['client', 'Clients']]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="primary" size="sm"><MessageSquarePlus />New chat</Button></DialogTrigger>
      <DialogContent title="New chat">
        <div className="space-y-3 p-4">
          {error && <Alert>{error}</Alert>}
          {builders.length > 1 && (
            <label className="block text-[13px] font-medium text-text-2">Builder
              <Select className="mt-1" value={org} onChange={(e) => { setOrg(e.target.value); setJob('') }}>{builders.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
            </label>
          )}
          <label className="block text-[13px] font-medium text-text-2">About a job (optional)
            <Select className="mt-1" value={job} onChange={(e) => setJob(e.target.value)} aria-label="Job">
              <option value="">No specific job</option>
              {jobs.filter((j) => j.org_id === org).map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </Select>
          </label>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border p-2">
            {groups.map(([k, l]) => {
              const list = people.filter((p) => p.kind === k)
              if (!list.length) return null
              return (
                <div key={k}>
                  <div className="text-xs font-medium text-text-3">{l}</div>
                  {list.map((p) => (
                    <label key={p.user_id} className="flex items-center gap-2 py-0.5 text-[13px]">
                      <Checkbox checked={picked.includes(p.user_id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.user_id] : picked.filter((x) => x !== p.user_id))} />
                      {p.name || p.email}{p.company && k === 'sub' ? <span className="text-text-3"> · {p.company}</span> : null}
                    </label>
                  ))}
                </div>
              )
            })}
            {people.length === 0 && <p className="text-[13px] text-text-3">Nobody to chat with here yet.</p>}
          </div>
          {picked.length > 1 && <label className="block text-[13px] font-medium text-text-2">Group name<Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></label>}
          <Textarea aria-label="First message" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder="First message (optional)" />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={go} disabled={pending || picked.length === 0}>Start chat</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
