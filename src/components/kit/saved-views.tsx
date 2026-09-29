'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Bookmark, Check, Trash2, Users } from 'lucide-react'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/dropdown'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { saveView, deleteView } from '@/app/(app)/views/actions'

export type ViewItem = { id: string; name: string; query: string; is_shared: boolean; is_default: boolean; mine: boolean }

/** Named saved views (filters + sort) for a list. Shared views are visible to the whole company. */
export function SavedViews({ module, views, canShare }: { module: string; views: ViewItem[]; canShare: boolean }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const current = new URLSearchParams(params); current.delete('page')
  const q = current.toString()
  const active = views.find((v) => v.query === q)

  return (
    <>
      <Menu modal={false}>
        <MenuTrigger asChild>
          <Button><Bookmark />{active ? active.name : 'Views'}</Button>
        </MenuTrigger>
        <MenuContent className="w-64">
          <MenuItem asChild><Link href={`${pathname}?view=`}>Default</Link></MenuItem>
          {views.length > 0 && <MenuSeparator />}
          {views.length > 0 && <MenuLabel>Saved views</MenuLabel>}
          {views.map((v) => (
            <MenuItem key={v.id} asChild>
              <Link href={`${pathname}?${v.query}`} className="group">
                <span className="flex-1 truncate">{v.name}</span>
                {v.is_shared && <Users />}
                {active?.id === v.id && <Check className="!text-brand" />}
                {v.mine && (
                  <button type="button" aria-label={`Delete ${v.name}`} className="opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); start(() => deleteView(v.id, pathname)) }}>
                    <Trash2 />
                  </button>
                )}
              </Link>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={() => setOpen(true)} disabled={!q}>Save current filters as a view…</MenuItem>
        </MenuContent>
      </Menu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Save view" description="Saves the current filters and sort.">
          <form className="space-y-4 p-4" onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            start(async () => {
              await saveView({ module, name: String(fd.get('name')), query: q, is_shared: fd.get('shared') === 'on', is_default: fd.get('default') === 'on', path: pathname })
              setOpen(false)
            })
          }}>
            <Field label="View name" htmlFor="view-name" required><Input id="view-name" name="name" required maxLength={60} /></Field>
            {canShare && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="shared" className="accent-brand" />Share with my company</label>}
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="default" className="accent-brand" />Open this view by default</label>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Save view'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
