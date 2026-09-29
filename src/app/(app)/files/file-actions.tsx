'use client'
import { useState, useTransition } from 'react'
import { Download, ExternalLink, History, PenLine, Link2, MoreHorizontal, Pencil, QrCode, Share2, Trash2, Undo2 } from 'lucide-react'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/dropdown'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ActionForm } from '@/components/kit/action-form'
import { createShareLink, revokeShareLinks, shareQr, setFileSharing, trashFiles, restoreFile, renameFile } from './actions'

export function FileActions({ id, name, canManage, canShare, trashed, subs, clients, versions, canSign }: {
  id: string; name: string; canManage: boolean; canShare: boolean; trashed?: boolean; subs: boolean; clients: boolean; versions: { version: number; created_at: string }[]; canSign?: boolean
}) {
  const [pending, start] = useTransition()
  const [share, setShare] = useState<{ url: string; qr?: string } | null>(null)
  const [rename, setRename] = useState(false)
  const [history, setHistory] = useState(false)
  if (trashed) return <Button size="sm" disabled={pending} onClick={() => start(() => restoreFile(id))}><Undo2 />Restore</Button>
  return (
    <>
      <Menu modal={false}>
        <MenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for ${name}`}><MoreHorizontal /></Button></MenuTrigger>
        <MenuContent align="end">
          <MenuItem asChild><a href={`/files/${id}/download?inline=1`} target="_blank" rel="noreferrer"><ExternalLink />Open in new tab</a></MenuItem>
          <MenuItem asChild><a href={`/files/${id}/download`}><Download />Download</a></MenuItem>
          {canShare && <MenuItem onSelect={() => start(async () => setShare({ url: await createShareLink(id) }))}><Share2 />Share link</MenuItem>}
          {versions.length > 0 && <MenuItem onSelect={() => setHistory(true)}><History />Version history</MenuItem>}
          {canSign && <MenuItem asChild><a href={`/signatures/new?file=${id}`}><PenLine />Request signatures</a></MenuItem>}
          {canManage && <>
            <MenuSeparator />
            <MenuItem onSelect={() => setRename(true)}><Pencil />Rename</MenuItem>
            <MenuItem onSelect={() => start(() => setFileSharing(id, !subs, clients))}>{subs ? 'Hide from subs' : 'Share with subs'}</MenuItem>
            <MenuItem onSelect={() => start(() => setFileSharing(id, subs, !clients))}>{clients ? 'Hide from client' : 'Share with client'}</MenuItem>
            <MenuItem onSelect={() => start(() => trashFiles([id]))} className="text-danger"><Trash2 />Move to trash</MenuItem>
          </>}
        </MenuContent>
      </Menu>
      <Dialog open={Boolean(share)} onOpenChange={(o) => !o && setShare(null)}>
        <DialogContent title={`Share ${name}`} description="Anyone with the link can open this file until you turn the link off.">
          {share && (
            <div className="space-y-3 p-4">
              <div className="flex gap-2"><Input readOnly value={share.url} aria-label="Share link" /><Button onClick={() => navigator.clipboard.writeText(share.url)}><Link2 />Copy</Button></div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => start(async () => setShare({ ...share, qr: await shareQr(share.url) }))}><QrCode />QR code</Button>
                <Button asChild><a href={`mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(share.url)}`}>Send by email</a></Button>
                <Button variant="ghost" onClick={() => start(async () => { await revokeShareLinks(id); setShare(null) })}>Turn off link</Button>
              </div>
              {share.qr && <img src={share.qr} alt={`QR code for ${name}`} className="mx-auto size-48" />}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={rename} onOpenChange={setRename}>
        <DialogContent title="Rename file">
          <ActionForm action={renameFile.bind(null, id)} resetOnSuccess={false} className="flex gap-2 p-4">
            <Input name="name" defaultValue={name} aria-label="File name" required maxLength={255} /><Button type="submit" variant="primary">Save</Button>
          </ActionForm>
        </DialogContent>
      </Dialog>
      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent title="Version history">
          <ul className="divide-y divide-border p-2 text-[13px]">
            {versions.map((v) => (
              <li key={v.version} className="flex items-center justify-between px-2 py-2">
                <span>Version {v.version} · {new Date(v.created_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <a className="text-brand hover:underline" href={`/files/${id}/download?v=${v.version}`}>Download</a>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
