'use client'
import { usePathname } from 'next/navigation'
import { useMemo, useOptimistic, useState, useSyncExternalStore, useTransition } from 'react'
import { ArrowDownUp, Check, ChevronDown, ChevronsLeft, ChevronsRight, Filter, MoreHorizontal, Search } from 'lucide-react'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/dropdown'
import { MODULE_BY_SLUG } from '@/lib/modules'
import { cn } from '@/lib/utils'
import { setActiveOrg, setJobSelection } from '@/app/(app)/shell-actions'

export type SwitchOption = { id: string; label: string; sublabel?: string; group: string }
export type SidebarJob = {
  id: string; title: string; status: string; color: string; builder_name: string | null
  projected_start: string | null; projected_end: string | null; created_at: string
}

type SortKey = 'az' | 'za' | 'start' | 'end' | 'created'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'az', label: 'Alphabetically' },
  { key: 'za', label: 'Reverse alphabetically' },
  { key: 'start', label: 'Projected start date' },
  { key: 'end', label: 'Projected end date' },
  { key: 'created', label: 'Created date' },
]
const STATUSES = ['presale', 'open', 'warranty', 'closed'] as const
const DEFAULT_STATUSES = ['presale', 'open', 'warranty']
const JOB_PAGES = new Set(['/summary', '/jobs'])

// Sidebar collapsed state lives in localStorage (per browser convenience)
const KEY = 'mb.sidebar.collapsed'
function readCollapsed() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
function writeCollapsed(v: boolean) {
  try { localStorage.setItem(KEY, v ? '1' : '0') } catch {}
  window.dispatchEvent(new Event('mb-sidebar'))
}
function subscribeCollapsed(cb: () => void) {
  window.addEventListener('mb-sidebar', cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener('mb-sidebar', cb); window.removeEventListener('storage', cb) }
}

function isJobScoped(pathname: string) {
  const first = '/' + (pathname.split('/')[1] ?? '')
  if (JOB_PAGES.has(first)) return true
  return MODULE_BY_SLUG.get(first.slice(1))?.jobScoped ?? false
}

export function JobSidebar({
  options, currentId, jobs, selection, showBuilderNames,
}: {
  options: SwitchOption[]
  currentId: string
  jobs: SidebarJob[]
  selection: { allJobs: boolean; jobIds: string[] }
  showBuilderNames: boolean
}) {
  const pathname = usePathname()
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false)
  const [query, setQuery] = useState('')
  const [statuses, setStatuses] = useState<string[]>(DEFAULT_STATUSES)
  const [sort, setSort] = useState<SortKey>('az')
  const [sel, setOptimisticSel] = useOptimistic(selection)
  const [pending, startTransition] = useTransition()
  const toggleCollapsed = () => writeCollapsed(!collapsed)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = jobs.filter((j) => statuses.includes(j.status) && (!q || j.title.toLowerCase().includes(q) || (j.builder_name ?? '').toLowerCase().includes(q)))
    const by = (a: string | null, b: string | null) => (a ?? '9999').localeCompare(b ?? '9999')
    return list.sort((a, b) =>
      sort === 'az' ? a.title.localeCompare(b.title)
      : sort === 'za' ? b.title.localeCompare(a.title)
      : sort === 'start' ? by(a.projected_start, b.projected_start)
      : sort === 'end' ? by(a.projected_end, b.projected_end)
      : b.created_at.localeCompare(a.created_at))
  }, [jobs, query, statuses, sort])

  if (!isJobScoped(pathname) && options.length <= 1) return null

  const current = options.find((o) => o.id === currentId)
  const selectedIds = new Set(sel.jobIds)
  const isSelected = (id: string) => sel.allJobs || selectedIds.has(id)
  const isDefault = statuses.length === DEFAULT_STATUSES.length && DEFAULT_STATUSES.every((s) => statuses.includes(s))
  const filterCount = (isDefault ? 0 : 1) + (query ? 1 : 0)
  const allLabel = isDefault && !query ? `All active jobs (${visible.length})`
    : statuses.length === 1 && !query ? `All ${statuses[0]} jobs (${visible.length})`
    : `All matching jobs (${visible.length})`

  function save(next: { allJobs: boolean; jobIds: string[] }) {
    startTransition(async () => {
      setOptimisticSel(next)
      await setJobSelection(next.allJobs, next.jobIds)
    })
  }
  function onRowClick(e: React.MouseEvent, id: string) {
    if (e.metaKey || e.ctrlKey) {
      const base = sel.allJobs ? visible.map((j) => j.id) : sel.jobIds
      const ids = base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
      save({ allJobs: false, jobIds: ids })
    } else {
      save({ allJobs: false, jobIds: [id] })
    }
  }
  function toggle(id: string) {
    const base = sel.allJobs ? visible.map((j) => j.id) : sel.jobIds
    save({ allJobs: false, jobIds: base.includes(id) ? base.filter((x) => x !== id) : [...base, id] })
  }

  if (collapsed) {
    return (
      <aside className="hidden w-10 shrink-0 border-r border-border bg-surface md:block">
        <button onClick={toggleCollapsed} className="m-1 rounded p-1.5 text-text-3 hover:bg-surface-2" aria-label="Open job list">
          <ChevronsRight className="size-4" />
        </button>
      </aside>
    )
  }

  const groups = [...new Set(options.map((o) => o.group))]

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-surface md:flex" aria-label="Jobs">
      {/* Company / builder switcher */}
      <div className="flex items-center gap-1 border-b border-border p-2">
        <Menu modal={false}>
          <MenuTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-surface-2" disabled={options.length <= 1}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded bg-nav text-[11px] font-semibold text-white">
              {(current?.label ?? '?').slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{current?.label}</span>
              {current?.sublabel && <span className="block truncate text-[11px] text-text-3">{current.sublabel}</span>}
            </span>
            {options.length > 1 && <ChevronDown className="size-4 shrink-0 text-text-3" />}
          </MenuTrigger>
          <MenuContent className="w-64">
            {groups.map((g, gi) => (
              <div key={g}>
                {gi > 0 && <MenuSeparator />}
                <MenuLabel>{g}</MenuLabel>
                {options.filter((o) => o.group === g).map((o) => (
                  <MenuItem key={o.id} onSelect={() => o.id !== currentId && startTransition(() => setActiveOrg(o.id))}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.sublabel && <span className="block truncate text-[11px] text-text-3">{o.sublabel}</span>}
                    </span>
                    {o.id === currentId && <Check className="!text-brand" />}
                  </MenuItem>
                ))}
              </div>
            ))}
          </MenuContent>
        </Menu>
        <button onClick={toggleCollapsed} className="rounded p-1.5 text-text-3 hover:bg-surface-2" aria-label="Collapse job list">
          <ChevronsLeft className="size-4" />
        </button>
      </div>

      {/* Search, filter, sort */}
      <div className="flex items-center gap-1 border-b border-border p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs"
            aria-label="Search jobs"
            className="h-7 w-full rounded-md border border-border-strong bg-surface pl-7 pr-2 text-[13px] focus:border-brand focus:outline-none"
          />
        </div>
        <Menu modal={false}>
          <MenuTrigger className="relative rounded p-1.5 text-text-2 outline-none hover:bg-surface-2" aria-label="Filter jobs">
            <Filter className="size-4" />
            {filterCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-white">{filterCount}</span>
            )}
          </MenuTrigger>
          <MenuContent align="end">
            <MenuLabel>Job status</MenuLabel>
            {STATUSES.map((s) => (
              <MenuItem key={s} onSelect={(e) => { e.preventDefault(); setStatuses((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]) }}>
                <span className="flex size-4 items-center justify-center rounded border border-border-strong">
                  {statuses.includes(s) && <Check className="size-3 !text-brand" />}
                </span>
                <span className="capitalize">{s}</span>
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem onSelect={() => { setStatuses(DEFAULT_STATUSES); setQuery('') }}>Reset</MenuItem>
          </MenuContent>
        </Menu>
        <Menu modal={false}>
          <MenuTrigger className="rounded p-1.5 text-text-2 outline-none hover:bg-surface-2" aria-label="Sort jobs">
            <ArrowDownUp className="size-4" />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuLabel>Sort by</MenuLabel>
            {SORTS.map((s) => (
              <MenuItem key={s.key} onSelect={() => setSort(s.key)}>
                <span className="flex-1">{s.label}</span>
                {sort === s.key && <Check className="!text-brand" />}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </div>

      {/* Job list */}
      <div className={cn('flex-1 overflow-y-auto py-1', pending && 'opacity-70')}>
        <button
          onClick={() => {
            // Everything when unfiltered; otherwise exactly the jobs shown (e.g. active only)
            const everything = statuses.length === STATUSES.length && !query
            save({ allJobs: everything, jobIds: everything ? [] : visible.map((j) => j.id) })
          }}
          className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-surface-2', (sel.allJobs || (visible.length > 0 && visible.every((j) => selectedIds.has(j.id)) && sel.jobIds.length === visible.length)) && 'bg-brand-soft font-medium text-brand')}
        >
          <MoreHorizontal className="size-4" />
          {allLabel}
        </button>
        {visible.map((j) => (
          <div
            key={j.id}
            className={cn('group flex items-center gap-2 px-3 py-1.5 hover:bg-surface-2', isSelected(j.id) && !sel.allJobs && 'bg-brand-soft')}
          >
            <input
              type="checkbox"
              checked={isSelected(j.id)}
              onChange={() => toggle(j.id)}
              aria-label={`Select ${j.title}`}
              className="size-3.5 accent-brand opacity-0 group-hover:opacity-100 checked:opacity-100"
            />
            <button onClick={(e) => onRowClick(e, j.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={`${j.title} · ${j.status}`}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: j.color }} />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-[13px]', isSelected(j.id) && !sel.allJobs && 'font-medium text-brand')}>{j.title}</span>
                {showBuilderNames && j.builder_name && <span className="block truncate text-[11px] text-text-3">{j.builder_name}</span>}
              </span>
            </button>
          </div>
        ))}
        {visible.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-text-3">No jobs match.</p>}
      </div>
    </aside>
  )
}
