'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { putFile } from '@/lib/upload'
import { finishLogoUpload, removeLogo, startLogoUpload } from '../../settings/actions'

export function LogoUpload({ orgId, hasLogo, version }: { orgId: string; hasLogo: boolean; version: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const pick = (f?: File) => f && start(async () => {
    setError('')
    try {
      const { key, url } = await startLogoUpload(f.type, f.size)
      await putFile(url, f, f.type, () => {})
      await finishLogoUpload(key)
      router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed') }
  })
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="grid h-16 w-40 place-items-center rounded-md border border-dashed border-border bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {hasLogo ? <img src={`/branding/${orgId}/logo?v=${encodeURIComponent(version)}`} alt="Company logo" className="max-h-14 max-w-36 object-contain" /> : <span className="text-xs text-text-3">No logo</span>}
      </div>
      <label className="cursor-pointer">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" aria-label="Upload logo" onChange={(e) => pick(e.target.files?.[0])} disabled={pending} />
        <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] font-medium hover:bg-surface-2"><ImagePlus className="size-4" />{pending ? 'Uploading…' : hasLogo ? 'Replace logo' : 'Upload logo'}</span>
      </label>
      {hasLogo && <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await removeLogo(); router.refresh() })}><Trash2 />Remove</Button>}
      <span className="text-xs text-text-3">PNG, JPG, WebP or SVG, up to 2 MB. Shown on proposals, invoices, change orders and POs.</span>
      {error && <Alert className="w-full">{error}</Alert>}
    </div>
  )
}
