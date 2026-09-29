import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileText, Film, FolderOpen, Folder, Globe2, Image as ImageIcon, Lock, Trash2, Users, Home } from 'lucide-react'
import { getAppContext, can, selectedJobs } from '@/lib/context'
import { createClient } from '@/lib/supabase/server'
import { signDownload } from '@/lib/storage'
import { PageHeader, NoJobBanner } from '@/components/shell/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { ActionForm } from '@/components/kit/action-form'
import { Uploader } from '@/components/kit/uploader'
import { cn, formatDate } from '@/lib/utils'
import { createFolder } from './actions'
import { FileActions } from './file-actions'
import { FolderSharing } from './folder-sharing'

type Kind = 'documents' | 'photos' | 'videos'
const TITLE: Record<Kind, string> = { documents: 'Documents', photos: 'Photos', videos: 'Videos' }
const ACCEPT: Record<Kind, string | undefined> = { documents: undefined, photos: 'image/*', videos: 'video/*' }
type Sp = Record<string, string | string[] | undefined>
const one = (v: Sp[string]) => (Array.isArray(v) ? v[0] : v)

function size(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}

export async function FilesPage({ kind, sp }: { kind: Kind; sp: Sp }) {
  const ctx = await getAppContext()
  const mode = ctx.workspace.mode
  if (mode === 'builder' && !can(ctx, 'files')) redirect('/summary?denied=files')
  const picked = selectedJobs(ctx)
  const job = picked.length === 1 ? picked[0] : null
  const folderId = one(sp.folder)
  const trash = one(sp.trash) === '1'
  const sort = (['name', 'created', 'modified'] as const).find((s) => s === one(sp.sort)) ?? 'modified'
  const dir = one(sp.dir) === 'asc' ? 'asc' : 'desc'
  const supabase = await createClient()
  const canAdd = mode === 'builder' && can(ctx, 'files', 'add')
  const canEdit = mode === 'builder' && can(ctx, 'files', 'edit')
  const base = `/${kind}`

  // Folders: global (company-wide) + this job's
  let fq = supabase.from('file_folders').select('id,name,job_id,system_key,share_subs,share_clients,updated_at').eq('kind', kind).is('deleted_at', null)
  fq = job ? fq.or(`job_id.is.null,job_id.eq.${job.id}`) : fq.is('job_id', null)
  const { data: folderRows } = await fq.order('name')
  const folders = (folderRows ?? []).filter((f) => f.system_key !== 'attachments')
  const current = folderId ? folders.find((f) => f.id === folderId) ?? null : null
  if (folderId && !current) redirect(base)

  const header = (
    <PageHeader title={TITLE[kind]} jobName={job?.title ?? null} jobHref={job ? `/jobs/${job.id}` : undefined}
      actions={<>
        {canEdit && <Button asChild variant="ghost"><Link href={trash ? base : `${base}?trash=1`}><Trash2 />{trash ? 'Back to files' : 'View trash'}</Link></Button>}
        {!trash && !current && canAdd && (
          <Dialog>
            <DialogTrigger asChild><Button><Folder />Add a folder</Button></DialogTrigger>
            <DialogContent title="Add a folder">
              <ActionForm action={createFolder.bind(null, kind, job?.id ?? null)} className="space-y-3 p-4">
                <Field label="Folder name" htmlFor="fname" required><Input id="fname" name="name" required maxLength={120} /></Field>
                <p className="text-xs text-text-3">{job ? `In ${job.title}.` : 'No job selected: this becomes a company-wide folder shown in every job.'}</p>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="share_subs" className="accent-brand" />Subs and vendors can view</label>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="share_clients" className="accent-brand" />Client can view</label>
                <Button type="submit" variant="primary">Create folder</Button>
              </ActionForm>
            </DialogContent>
          </Dialog>
        )}
        {current && (canAdd || current.system_key === 'sub_uploads') && <Uploader folderId={current.id} accept={ACCEPT[kind]} audience={mode === 'builder' ? 'builder' : 'none'} />}
      </>}>
      <nav className="mt-2 text-[13px] text-text-3" aria-label="Breadcrumb">
        <Link href={base} className="hover:text-brand hover:underline">{TITLE[kind]}</Link>
        {current && <> / <span className="text-text">{current.name}</span></>}
        {trash && <> / <span className="text-text">Trash</span></>}
      </nav>
    </PageHeader>
  )

  // Trash view
  if (trash) {
    const jobIds = job ? [job.id] : picked.map((j) => j.id)
    const { data: gone } = await supabase.from('files').select('id,name,size_bytes,deleted_at,version,share_subs,share_clients')
      .eq('kind', kind).not('deleted_at', 'is', null).in('job_id', jobIds.length ? jobIds : ['00000000-0000-0000-0000-000000000000']).order('deleted_at', { ascending: false })
    return (
      <>{header}<div className="p-5"><Card>
        {(gone ?? []).length === 0 ? <EmptyState icon={Trash2} title="Trash is empty" body="Deleted files can be restored from here." /> : (
          <ul className="divide-y divide-border">
            {(gone ?? []).map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                <FileText className="size-4 text-text-3" /><span className="flex-1">{f.name}</span>
                <span className="text-xs text-text-3">Deleted {formatDate(f.deleted_at)}</span>
                <FileActions id={f.id} name={f.name} canManage canShare={false} trashed subs={f.share_subs} clients={f.share_clients} versions={[]} />
              </li>
            ))}
          </ul>
        )}
      </Card></div></>
    )
  }

  // Folder grid (root)
  if (!current) {
    const { data: counts } = folders.length ? await supabase.from('files').select('folder_id').in('folder_id', folders.map((f) => f.id)).is('deleted_at', null).eq('status', 'ready') : { data: [] }
    const n = new Map<string, number>()
    for (const c of counts ?? []) n.set(c.folder_id, (n.get(c.folder_id) ?? 0) + 1)
    return (
      <>{header}
        {!job && ctx.jobs.length > 0 && <NoJobBanner />}
        <div className="p-5">
          {folders.length === 0 ? (
            <Card><EmptyState icon={FolderOpen} title="Add a folder" body="Organize your documents, photos, and videos. Add a folder to start uploading files." /></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {folders.map((f) => (
                <Link key={f.id} href={`${base}?folder=${f.id}`} className="group rounded-lg border border-border bg-surface p-3 hover:border-brand/40 hover:shadow-sm">
                  <div className="flex items-start gap-2.5">
                    {f.job_id ? <Folder className="size-8 shrink-0 text-brand" /> : <Globe2 className="size-8 shrink-0 text-brand" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium group-hover:text-brand">{f.name}</div>
                      <div className="text-xs text-text-3">{n.get(f.id) ?? 0} files · {formatDate(f.updated_at)}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    {!f.job_id && <Badge>Company-wide</Badge>}
                    {f.system_key === 'sub_uploads' && <Badge>System</Badge>}
                    {mode === 'builder' && canEdit && !f.system_key ? <FolderSharing id={f.id} subs={f.share_subs} clients={f.share_clients} />
                      : mode === 'builder' && <>{f.share_subs && <Badge tone="brand"><Users className="mr-1 size-3" />Subs</Badge>}{f.share_clients && <Badge tone="brand"><Home className="mr-1 size-3" />Client</Badge>}</>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </>
    )
  }

  // Files in a folder
  const order = sort === 'name' ? 'name' : sort === 'created' ? 'created_at' : 'updated_at'
  const { data: files } = await supabase.from('files')
    .select('id,name,mime,size_bytes,created_at,updated_at,version,share_subs,share_clients,uploaded_by,uploader_type,storage_key,profiles!files_uploaded_by_fkey(first_name,last_name,email),file_versions(version,created_at)')
    .eq('folder_id', current.id).is('deleted_at', null).eq('status', 'ready').order(order, { ascending: dir === 'asc' })
  const thumbs = new Map<string, string>()
  if (kind === 'photos') for (const f of files ?? []) if (f.mime.startsWith('image/')) thumbs.set(f.id, await signDownload(f.storage_key, f.name, true))
  const sortLink = (s: string, label: string) => (
    <Link href={`${base}?folder=${current.id}&sort=${s}&dir=${sort === s && dir === 'desc' ? 'asc' : 'desc'}`}
      className={cn('rounded px-2 py-1', sort === s ? 'bg-surface-2 font-medium text-text' : 'hover:bg-surface-2')}>{label}{sort === s ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</Link>
  )
  const Icon = kind === 'photos' ? ImageIcon : kind === 'videos' ? Film : FileText
  return (
    <>{header}
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-1 text-[13px] text-text-3">
          <span className="mr-1">Sort by</span>{sortLink('name', 'Name')}{sortLink('created', 'Created')}{sortLink('modified', 'Modified')}
          {mode === 'builder' && current.system_key !== 'sub_uploads' && (
            <span className="ml-auto flex items-center gap-2">{current.share_subs || current.share_clients ? 'Folder shared with:' : <><Lock className="size-3.5" />Team only</>}
              {current.share_subs && <Badge tone="brand">Subs</Badge>}{current.share_clients && <Badge tone="brand">Client</Badge>}</span>
          )}
        </div>
        <Card>
          {(files ?? []).length === 0 ? (
            <EmptyState icon={Icon} title="No files yet" body={canAdd || current.system_key === 'sub_uploads' ? 'Upload files to this folder.' : 'Nothing has been shared with you here yet.'} />
          ) : kind === 'photos' ? (
            <ul className="grid gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {(files ?? []).map((f) => (
                <li key={f.id} className="group relative overflow-hidden rounded-md border border-border">
                  <a href={`/files/${f.id}/download?inline=1`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {thumbs.get(f.id) ? <img src={thumbs.get(f.id)} alt={f.name} className="aspect-square w-full object-cover" loading="lazy" /> : <div className="flex aspect-square items-center justify-center bg-surface-2"><ImageIcon className="size-8 text-text-3" /></div>}
                  </a>
                  <div className="flex items-center gap-1 px-2 py-1 text-xs"><span className="flex-1 truncate">{f.name}</span>
                    <FileActions id={f.id} name={f.name} canManage={canEdit || f.uploaded_by === ctx.userId} canShare={mode === 'builder'} subs={f.share_subs} clients={f.share_clients}
                      versions={(f.file_versions ?? []) as { version: number; created_at: string }[]} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-border">
              {(files ?? []).map((f) => {
                const p = f.profiles as { first_name: string; last_name: string; email: string } | null
                return (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                    <Icon className="size-5 shrink-0 text-text-3" />
                    <div className="min-w-0 flex-1">
                      <a href={`/files/${f.id}/download?inline=1`} target="_blank" rel="noreferrer" className="block truncate font-medium text-brand hover:underline">{f.name}</a>
                      <div className="text-xs text-text-3">{new Date(f.created_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })} · {p ? `${p.first_name} ${p.last_name}`.trim() || p.email : ''}{f.uploader_type === 'sub' ? ' (sub)' : ''} · {size(f.size_bytes)}{f.version > 1 ? ` · v${f.version}` : ''}</div>
                    </div>
                    {mode === 'builder' && <span className="hidden gap-1 sm:flex">{f.share_subs && <Badge tone="brand">Subs</Badge>}{f.share_clients && <Badge tone="brand">Client</Badge>}</span>}
                    {(canEdit || f.uploaded_by === ctx.userId) && <Uploader folderId={current.id} replaceFileId={f.id} label="New version" audience="none" />}
                    <FileActions id={f.id} name={f.name} canManage={canEdit || f.uploaded_by === ctx.userId} canShare={mode === 'builder'} subs={f.share_subs} clients={f.share_clients}
                      versions={(f.file_versions ?? []) as { version: number; created_at: string }[]} />
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
