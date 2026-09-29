'use client'
import { useMemo, useState, useTransition } from 'react'
import { FileUp, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Card, CardHeader } from '@/components/ui/card'
import { parseCsv } from '@/lib/csv-parse'
import { IMPORTERS, IMPORT_MAX_ROWS, autoMap, type ImportKind } from '@/lib/importers'
import { importRows, type ImportResult } from '../import-actions'

/** Upload a CSV, check the column matches, preview, import. Parsing happens in the browser. */
export function Importer({ kinds }: { kinds: ImportKind[] }) {
  const [kind, setKind] = useState<ImportKind>(kinds[0])
  const [file, setFile] = useState<string>('')
  const [table, setTable] = useState<string[][]>([])
  const [map, setMap] = useState<Record<string, number>>({})
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const def = IMPORTERS[kind]
  const headers = table[0] ?? []
  const body = table.slice(1)

  const load = async (f: File | undefined) => {
    setResult(null); setError('')
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { setError('CSV files can be up to 5 MB.'); return }
    const rows = parseCsv(await f.text())
    if (rows.length < 2) { setError('That file has no rows under the header.'); return }
    if (rows.length - 1 > IMPORT_MAX_ROWS) { setError(`Import up to ${IMPORT_MAX_ROWS.toLocaleString()} rows at a time.`); return }
    setFile(f.name); setTable(rows); setMap(autoMap(kind, rows[0]))
  }
  const pick = (k: ImportKind) => { setKind(k); setResult(null); if (table[0]) setMap(autoMap(k, table[0])) }
  const missing = def.fields.filter((f) => f.required && (map[f.key] ?? -1) < 0)
  const records = useMemo(() => body.map((r) => Object.fromEntries(def.fields.map((f) => [f.key, (map[f.key] ?? -1) >= 0 ? (r[map[f.key]] ?? '') : '']))), [body, def, map])

  const run = () => start(async () => {
    const r = await importRows(kind, records)
    if (r.error) setError(r.error); else { setResult(r); setError('') }
  })

  return (
    <Card>
      <CardHeader title="Import from a spreadsheet" description="Bring your jobs, leads, subs and cost codes over from Buildertrend or Excel. Save the sheet as CSV first." />
      <div className="space-y-4 p-4 text-[13px]">
        <div className="flex flex-wrap items-end gap-3">
          <label className="font-medium text-text-2">What are you importing?
            <Select aria-label="What are you importing?" className="mt-1 w-56" value={kind} onChange={(e) => pick(e.target.value as ImportKind)}>
              {kinds.map((k) => <option key={k} value={k}>{IMPORTERS[k].label}</option>)}
            </Select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border-strong px-3 py-1.5 font-medium hover:bg-surface-2">
            <FileUp className="size-4" />{file || 'Choose CSV file'}
            <input type="file" accept=".csv,text/csv" aria-label="CSV file" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
          </label>
        </div>
        <p className="text-text-3">{def.hint}</p>
        {error && <Alert>{error}</Alert>}
        {headers.length > 0 && (
          <>
            <div>
              <h3 className="mb-2 font-semibold">Match your columns</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {def.fields.map((f) => (
                  <label key={f.key} className="text-text-2">{f.label}{f.required && <span className="text-danger"> *</span>}
                    <Select aria-label={`Column for ${f.label}`} className="mt-1" value={String(map[f.key] ?? -1)} onChange={(e) => setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }))}>
                      <option value="-1">— not in file —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </Select>
                  </label>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[640px]">
                <thead className="bg-surface-2 text-left text-xs text-text-3"><tr><th className="px-2 py-1">Row</th>{def.fields.filter((f) => (map[f.key] ?? -1) >= 0).map((f) => <th key={f.key} className="px-2 py-1">{f.label}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">
                  {records.slice(0, 8).map((r, i) => (
                    <tr key={i}><td className="px-2 py-1 text-text-3">{i + 2}</td>{def.fields.filter((f) => (map[f.key] ?? -1) >= 0).map((f) => <td key={f.key} className="max-w-48 truncate px-2 py-1">{r[f.key]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {records.length > 8 && <p className="px-2 py-1 text-xs text-text-3">…and {records.length - 8} more rows</p>}
            </div>
            {missing.length > 0 && <Alert>Pick a column for {missing.map((f) => f.label).join(' and ')}.</Alert>}
            <Button variant="primary" onClick={run} disabled={pending || missing.length > 0}><Upload />{pending ? 'Importing…' : `Import ${records.length} ${def.label.toLowerCase()}`}</Button>
          </>
        )}
        {result && (
          <div className="space-y-2" data-testid="import-result">
            <Alert tone="success">{result.created} imported{result.skipped?.length ? `, ${result.skipped.length} skipped` : ''}.</Alert>
            {!!result.skipped?.length && (
              <ul className="max-h-48 overflow-y-auto rounded-md border border-border text-xs">
                {result.skipped.map((s) => <li key={s.row} className="border-b border-border px-2 py-1 last:border-0">Row {s.row}: {s.reason}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
