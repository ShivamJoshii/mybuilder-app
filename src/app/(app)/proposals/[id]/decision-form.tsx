'use client'
import { useActionState, useRef, useState } from 'react'
import { CheckCircle2, Eraser, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import type { ActionState } from '@/components/kit/action-form'
import { cn } from '@/lib/utils'

/** Approve / decline with a typed or drawn signature. */
export function DecisionForm({
  action, needSignature, defaultName, onBehalf,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>
  needSignature: boolean; defaultName: string; onBehalf: boolean
}) {
  const [state, formAction, pending] = useActionState(action, {})
  const [mode, setMode] = useState<'type' | 'draw'>('type')
  const [name, setName] = useState(defaultName)
  const [drawn, setDrawn] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (e.currentTarget.width / r.width), y: (e.clientY - r.top) * (e.currentTarget.height / r.height) }
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!.getContext('2d')!
    c.lineWidth = 2.5; c.lineCap = 'round'; c.strokeStyle = '#111827'
    const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y); drawing.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const c = canvas.current!.getContext('2d')!; const p = pos(e); c.lineTo(p.x, p.y); c.stroke()
  }
  const up = () => { if (drawing.current) { drawing.current = false; setDrawn(canvas.current!.toDataURL('image/png')) } }
  const clear = () => { canvas.current!.getContext('2d')!.clearRect(0, 0, 600, 160); setDrawn('') }

  const signature = mode === 'type' ? (name.trim() ? `typed:${name.trim()}` : '') : drawn
  if (state.ok) return <Alert tone="success">{state.ok}</Alert>

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {onBehalf && <Alert tone="info">You are recording the client&apos;s decision on their behalf. This is noted on the signature.</Alert>}
      <label className="block text-[13px] font-medium text-text-2">Full name
        <Input name="signer_name" className="mt-1" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {needSignature && (
        <div>
          <div className="mb-1 flex gap-1 text-[13px]">
            {(['type', 'draw'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setDrawn('') }} className={cn('rounded px-2 py-1', mode === m ? 'bg-brand-soft font-medium text-brand' : 'text-text-3')}>
                {m === 'type' ? 'Type signature' : 'Draw signature'}
              </button>
            ))}
          </div>
          {mode === 'type' ? (
            <div className="flex h-24 items-center rounded-md border border-border bg-surface px-4 font-serif text-3xl italic text-text" aria-label="Typed signature preview">{name || <span className="text-base not-italic text-text-3">Your typed name appears here</span>}</div>
          ) : (
            <div className="relative">
              <canvas ref={canvas} width={600} height={160} aria-label="Signature pad" className="h-32 w-full touch-none rounded-md border border-border bg-white"
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
              <Button type="button" size="sm" variant="ghost" className="absolute right-1 top-1" onClick={clear}><Eraser />Clear</Button>
            </div>
          )}
        </div>
      )}
      <input type="hidden" name="signature" value={signature} />
      <Textarea name="comment" aria-label="Comment" placeholder="Comment (optional)" maxLength={4000} rows={2} />
      <label className="flex items-start gap-2 text-[13px] text-text-2">
        <Checkbox name="agree" className="mt-0.5" /> I agree that my electronic signature is the legal equivalent of my handwritten signature and I approve the scope and pricing in this proposal.
      </label>
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="approved" variant="primary" disabled={pending}><CheckCircle2 />Approve{needSignature ? ' and sign' : ''}</Button>
        <Button type="submit" name="decision" value="declined" disabled={pending}><XCircle />Decline</Button>
      </div>
    </form>
  )
}
