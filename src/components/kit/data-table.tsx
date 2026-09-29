import Link from 'next/link'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Column<T> = {
  key: string
  label: string
  sortable?: boolean
  className?: string
  render: (row: T) => React.ReactNode
}

/** Server-rendered grid: sortable headers (via URL), pagination footer "1–N of N items". */
export function DataTable<T extends { id: string }>({
  rows, columns, total, page, pageSize, sort, dir, baseParams, empty,
}: {
  rows: T[]
  columns: Column<T>[]
  total: number
  page: number
  pageSize: number
  sort?: string
  dir?: 'asc' | 'desc'
  baseParams: Record<string, string | string[] | undefined>
  empty?: React.ReactNode
}) {
  const href = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(baseParams)) {
      if (Array.isArray(v)) v.forEach((x) => sp.append(k, x))
      else if (v != null) sp.set(k, v)
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) sp.delete(k)
      else sp.set(k, v)
    }
    return `?${sp.toString()}`
  }
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="bg-surface-2 text-left text-xs font-semibold text-text-2">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn('whitespace-nowrap border-b border-border px-3 py-2', c.className)}>
                  {c.sortable ? (
                    <Link
                      href={href({ sort: c.key, dir: sort === c.key && dir === 'asc' ? 'desc' : 'asc', page: undefined })}
                      className="inline-flex items-center gap-1 hover:text-text"
                    >
                      {c.label}
                      {sort === c.key ? (dir === 'asc' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />) : null}
                    </Link>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-3 py-2 align-top', c.className)}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && empty}
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-text-3">
        <span>{start}–{end} of {total} items</span>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            {page > 1 && <Link className="rounded px-2 py-1 hover:bg-surface-2" href={href({ page: String(page - 1) })}>Previous</Link>}
            <span>Page {page} of {pages}</span>
            {page < pages && <Link className="rounded px-2 py-1 hover:bg-surface-2" href={href({ page: String(page + 1) })}>Next</Link>}
          </div>
        )}
      </div>
    </div>
  )
}
