'use client'
import { useRef, useState } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

/** A submit button that asks before submitting its form (deletes, removals). */
export function ConfirmSubmit({
  title, body, confirmLabel = 'Delete', children, ...props
}: ButtonProps & { title: string; body: string; confirmLabel?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Button type="button" {...props} onClick={() => setOpen(true)}>{children}</Button>
      <button ref={ref} type="submit" hidden />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={title} description={body}>
          <div className="flex justify-end gap-2 p-4">
            <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" variant="danger" onClick={() => { setOpen(false); ref.current?.click() }}>{confirmLabel}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
