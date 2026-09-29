'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Dialog, DialogContent } from '@/components/ui/dialog'

function SaveButton({ label, draftLabel }: { label: string; draftLabel?: string }) {
  const { pending } = useFormStatus()
  return (
    <>
      {draftLabel && <Button type="submit" name="intent" value="draft" disabled={pending}>{draftLabel}</Button>}
      <Button type="submit" name="intent" value="save" variant="primary" disabled={pending}>{pending ? 'Saving…' : label}</Button>
    </>
  )
}

/**
 * Full-page record form shell: title bar with Cancel / Save, optional Draft badge,
 * and an unsaved-changes guard ("Do you want to save your changes before exiting?").
 */
export function RecordForm({
  title, action, cancelHref, saveLabel = 'Save', draftLabel, draft, error, children,
}: {
  title: string
  action: (formData: FormData) => void
  cancelHref: string
  saveLabel?: string
  /** Adds a secondary submit (intent=draft), e.g. "Save draft" next to "Publish". */
  draftLabel?: string
  draft?: boolean
  error?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [dirty, setDirty] = useState(false)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  return (
    <form ref={formRef} action={(fd) => { setDirty(false); action(fd) }} onChange={() => setDirty(true)} className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{title}</h1>
          {draft && <Badge tone="warning">Draft</Badge>}
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => (dirty ? setConfirm(true) : router.push(cancelHref))}>Cancel</Button>
          <SaveButton label={saveLabel} draftLabel={draftLabel} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl flex-1 space-y-5 p-5">
        {error && <Alert>{error}</Alert>}
        {children}
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title="Unsaved changes" description="Do you want to save your changes before exiting?">
          <div className="flex justify-end gap-2 p-4">
            <Button type="button" onClick={() => { setDirty(false); setConfirm(false); router.push(cancelHref) }}>Don’t save</Button>
            <Button type="button" variant="primary" onClick={() => {
              setConfirm(false)
              // Prefer the safe choice: save as draft when the form has a draft button
              const f = formRef.current
              const btn = f?.querySelector<HTMLButtonElement>('button[name=intent][value=draft]') ?? f?.querySelector<HTMLButtonElement>('button[name=intent][value=save]')
              f?.requestSubmit(btn ?? undefined)
            }}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  )
}

export function FormSection({ title, children, description }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {description && <p className="text-xs text-text-3">{description}</p>}
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}
