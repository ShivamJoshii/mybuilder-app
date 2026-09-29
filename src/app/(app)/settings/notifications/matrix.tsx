'use client'
import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { saveNotificationPrefs } from './actions'

type Row = { key: string; grp: string; module: string; label: string; email: boolean; text: boolean; push: boolean }
const CH = ['email', 'text', 'push'] as const

/** Row per event, columns Email / Text / Push, with an "All notifications" master row. */
export function NotificationMatrix({ rows: initial }: { rows: Row[] }) {
  const [rows, setRows] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const groups = [...new Set(rows.map((r) => r.grp))]
  const all = (c: (typeof CH)[number]) => rows.every((r) => r[c])
  const setAll = (c: (typeof CH)[number], v: boolean) => { setSaved(false); setRows((cur) => cur.map((r) => ({ ...r, [c]: v }))) }
  const set = (key: string, c: (typeof CH)[number], v: boolean) => { setSaved(false); setRows((cur) => cur.map((r) => (r.key === key ? { ...r, [c]: v } : r))) }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-surface-2 text-xs font-semibold text-text-2">
            <tr><th className="px-4 py-2 text-left">Event</th>{CH.map((c) => <th key={c} className="w-20 px-2 py-2 text-center capitalize">{c}</th>)}</tr>
          </thead>
          <tbody>
            <tr className="border-t border-border bg-brand-soft/40 font-medium">
              <td className="px-4 py-2">All notifications</td>
              {CH.map((c) => <td key={c} className="text-center"><input type="checkbox" aria-label={`All ${c}`} checked={all(c)} onChange={(e) => setAll(c, e.target.checked)} className="size-4 accent-brand" /></td>)}
            </tr>
            {groups.map((g) => [
              <tr key={g} className="border-t border-border"><td colSpan={4} className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-text-3">{g}</td></tr>,
              ...rows.filter((r) => r.grp === g).map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-4 py-1.5"><span className="text-text-3">{r.module} · </span>{r.label}</td>
                  {CH.map((c) => <td key={c} className="text-center"><input type="checkbox" aria-label={`${r.label} ${c}`} checked={r[c]} onChange={(e) => set(r.key, c, e.target.checked)} className="size-4 accent-brand" /></td>)}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border p-3">
        {saved && <Alert tone="success" className="py-1">Saved.</Alert>}
        <Button variant="primary" disabled={pending} onClick={() => start(async () => { await saveNotificationPrefs(rows.map(({ key, email, text, push }) => ({ key, email, text, push }))); setSaved(true) })}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  )
}
