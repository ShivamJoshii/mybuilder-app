'use client'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ArrowUpRight, Cloud, Eraser, GitCompare, Hand, Minus, PenLine, Plus, Save, Square, Type, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { openPdf } from '@/lib/pdf'
import { saveMarkup } from '../actions'

export type Version = { id: string; version: number; page: number; mime: string; note: string | null; created_at: string }
type Pt = [number, number]
export type Shape =
  | { id: string; t: 'pen'; c: string; w: number; pts: Pt[] }
  | { id: string; t: 'rect' | 'cloud'; c: string; w: number; x: number; y: number; wd: number; ht: number }
  | { id: string; t: 'arrow'; c: string; w: number; x1: number; y1: number; x2: number; y2: number }
  | { id: string; t: 'text'; c: string; w: number; x: number; y: number; text: string; size: number }
export type Markup = { version: number; author: string; mine: boolean; visibility: 'private' | 'team' | 'shared'; shapes: Shape[] }
type Tool = 'pan' | 'pen' | 'rect' | 'cloud' | 'arrow' | 'text' | 'erase'

const COLORS = ['#dc2626', '#2563eb', '#16a34a', '#111827', '#f59e0b']
const fileUrl = (v: Version) => `/plans/versions/${v.id}/file`

// ---------------------------------------------------------------------------
// Rendering a version to a canvas (PDF page or image), cached per version
// ---------------------------------------------------------------------------
const docs = new Map<string, Promise<Awaited<ReturnType<typeof openPdf>>>>()
const imgs = new Map<string, Promise<HTMLImageElement>>()

async function pageSize(v: Version): Promise<{ w: number; h: number }> {
  if (v.mime === 'application/pdf') {
    if (!docs.has(v.id)) docs.set(v.id, openPdf(fileUrl(v)))
    const page = await (await docs.get(v.id)!).getPage(v.page)
    const vp = page.getViewport({ scale: 1 })
    return { w: vp.width, h: vp.height }
  }
  const img = await loadImg(v)
  return { w: img.naturalWidth, h: img.naturalHeight }
}
function loadImg(v: Version) {
  if (!imgs.has(v.id)) imgs.set(v.id, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = fileUrl(v) }))
  return imgs.get(v.id)!
}
type Task = { cancel: () => void }
/** Renders into a fresh offscreen canvas (never reuses one mid-render); cancellable. */
async function renderPage(v: Version, size: { w: number; h: number }, px: number, tasks: Task[]) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(size.w * px); canvas.height = Math.round(size.h * px)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (v.mime === 'application/pdf') {
    if (!docs.has(v.id)) docs.set(v.id, openPdf(fileUrl(v)))
    const page = await (await docs.get(v.id)!).getPage(v.page)
    const vp0 = page.getViewport({ scale: 1 })
    const task = page.render({ canvas, canvasContext: ctx, viewport: page.getViewport({ scale: (size.w * px) / vp0.width }) })
    tasks.push(task)
    await task.promise
  } else {
    ctx.drawImage(await loadImg(v), 0, 0, canvas.width, canvas.height)
  }
  return canvas
}
function blit(src: HTMLCanvasElement, target: HTMLCanvasElement) {
  target.width = src.width; target.height = src.height
  target.getContext('2d')!.drawImage(src, 0, 0)
}
/** Overlay compare: what changed shows red (removed) or blue (added); unchanged stays grey. */
function composite(older: HTMLCanvasElement, newer: HTMLCanvasElement, out: HTMLCanvasElement) {
  out.width = newer.width; out.height = newer.height
  const a = older.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, out.width, out.height)
  const b = newer.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, out.width, out.height)
  const o = out.getContext('2d')!.createImageData(out.width, out.height)
  for (let i = 0; i < o.data.length; i += 4) {
    const la = (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3
    const lb = (b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3
    // removed (dark only in old) → red; added (dark only in new) → blue; unchanged stays as-is
    o.data[i] = lb; o.data[i + 1] = Math.min(la, lb); o.data[i + 2] = la; o.data[i + 3] = 255
  }
  out.getContext('2d')!.putImageData(o, 0, 0)
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------
function cloudPath(x: number, y: number, w: number, h: number, r: number) {
  const x2 = x + w, y2 = y + h
  const seg = (len: number) => Math.max(1, Math.round(len / (r * 2)))
  let d = `M ${x} ${y}`
  const nx = seg(w), ny = seg(h)
  for (let i = 1; i <= nx; i++) d += ` A ${w / nx / 2} ${w / nx / 2} 0 0 1 ${x + (w * i) / nx} ${y}`
  for (let i = 1; i <= ny; i++) d += ` A ${h / ny / 2} ${h / ny / 2} 0 0 1 ${x2} ${y + (h * i) / ny}`
  for (let i = 1; i <= nx; i++) d += ` A ${w / nx / 2} ${w / nx / 2} 0 0 1 ${x2 - (w * i) / nx} ${y2}`
  for (let i = 1; i <= ny; i++) d += ` A ${h / ny / 2} ${h / ny / 2} 0 0 1 ${x} ${y2 - (h * i) / ny}`
  return d
}
function norm(s: Shape): Shape {
  if ((s.t === 'rect' || s.t === 'cloud') && (s.wd < 0 || s.ht < 0)) {
    return { ...s, x: Math.min(s.x, s.x + s.wd), y: Math.min(s.y, s.y + s.ht), wd: Math.abs(s.wd), ht: Math.abs(s.ht) }
  }
  return s
}
function ShapeEl({ s, onErase }: { s: Shape; onErase?: () => void }) {
  const common = { stroke: s.c, strokeWidth: s.w, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    onPointerDown: onErase ? (e: React.PointerEvent) => { e.stopPropagation(); onErase() } : undefined, style: onErase ? { cursor: 'pointer', pointerEvents: 'visiblePainted' as const } : undefined, 'data-shape': s.t }
  const n = norm(s)
  switch (n.t) {
    case 'pen': return <polyline points={n.pts.map((p) => p.join(',')).join(' ')} {...common} />
    case 'rect': return <rect x={n.x} y={n.y} width={n.wd} height={n.ht} {...common} />
    case 'cloud': return <path d={cloudPath(n.x, n.y, n.wd, n.ht, Math.max(6, Math.min(n.wd, n.ht) / 8))} {...common} />
    case 'arrow': {
      const a = Math.atan2(n.y2 - n.y1, n.x2 - n.x1), L = 6 + n.w * 3
      const h1: Pt = [n.x2 - L * Math.cos(a - 0.45), n.y2 - L * Math.sin(a - 0.45)], h2: Pt = [n.x2 - L * Math.cos(a + 0.45), n.y2 - L * Math.sin(a + 0.45)]
      return <g {...common}><line x1={n.x1} y1={n.y1} x2={n.x2} y2={n.y2} /><polyline points={`${h1.join(',')} ${n.x2},${n.y2} ${h2.join(',')}`} /></g>
    }
    case 'text': return <text x={n.x} y={n.y} fill={n.c} fontSize={n.size} fontFamily="Inter, sans-serif" fontWeight={600} onPointerDown={common.onPointerDown} style={common.style} data-shape="text">{n.text}</text>
  }
}

// ---------------------------------------------------------------------------
export function PlanViewer({ sheetId, versions, currentVersion, markups, canTeam }: {
  sheetId: string; versions: Version[]; currentVersion: number; markups: Markup[]; canTeam: boolean
}) {
  const [vNum, setVNum] = useState(currentVersion)
  const [compareNum, setCompareNum] = useState<number | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState<number | null>(null)
  const [tool, setTool] = useState<Tool>('pan')
  const [color, setColor] = useState(COLORS[0])
  const [text, setText] = useState('')
  const [showOthers, setShowOthers] = useState(true)
  const [saved, setSaved] = useState<Record<number, { shapes: Shape[]; visibility: Markup['visibility'] }>>(() =>
    Object.fromEntries(markups.filter((m) => m.mine).map((m) => [m.version, { shapes: m.shapes, visibility: m.visibility }])))
  const [mine, setMine] = useState<Shape[]>(saved[currentVersion]?.shapes ?? [])
  const [visibility, setVisibility] = useState<Markup['visibility']>(saved[currentVersion]?.visibility ?? (canTeam ? 'team' : 'shared'))
  const [draft, setDraft] = useState<Shape | null>(null)
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({})
  const [loading, setLoading] = useState(true)
  const [pending, start] = useTransition()
  const canvas = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)

  const v = versions.find((x) => x.version === vNum) ?? versions[0]
  const cmp = compareNum != null ? versions.find((x) => x.version === compareNum) ?? null : null
  const dirty = JSON.stringify(mine) !== JSON.stringify(saved[vNum]?.shapes ?? []) || (mine.length > 0 && visibility !== (saved[vNum]?.visibility ?? visibility))
  const others = useMemo(() => markups.filter((m) => !m.mine && m.version === vNum), [markups, vNum])

  // Size of the sheet (page units), then fit to width on first load
  useEffect(() => {
    let live = true
    pageSize(v).then((s) => {
      if (!live) return
      setSize(s)
      setZoom((z) => z ?? Math.max(0.2, Math.min(3, ((wrap.current?.clientWidth ?? 1000) - 24) / s.w)))
    }).catch(() => live && setMsg({ error: 'Could not open this sheet.' }))
    return () => { live = false }
  }, [v])

  // Draw the sheet (or the comparison) whenever version/zoom changes
  useEffect(() => {
    if (!size || !zoom || !canvas.current) return
    let live = true
    const tasks: Task[] = []
    const px = zoom * (window.devicePixelRatio || 1)
    const target = canvas.current
    const job = cmp
      ? (async () => {
          await pageSize(cmp)
          const [a, b] = await Promise.all([renderPage(cmp, size, px, tasks), renderPage(v, size, px, tasks)])
          if (live) composite(a, b, target)
        })()
      : renderPage(v, size, px, tasks).then((c) => { if (live) blit(c, target) })
    job.then(() => live && setLoading(false)).catch((e: unknown) => {
      if (live && (e as { name?: string })?.name !== 'RenderingCancelledException') setMsg({ error: 'Could not draw this sheet.' })
    })
    return () => { live = false; tasks.forEach((t) => t.cancel()) }
  }, [v, cmp, size, zoom])

  const switchVersion = (n: number) => {
    if (dirty && !window.confirm('Discard unsaved markup on this version?')) return
    setVNum(n); setMine(saved[n]?.shapes ?? []); setVisibility(saved[n]?.visibility ?? (canTeam ? 'team' : 'shared')); setCompareNum(null); setLoading(true); setMsg({})
  }

  const toPage = useCallback((e: React.PointerEvent): Pt => {
    const r = svg.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * size!.w, ((e.clientY - r.top) / r.height) * size!.h]
  }, [size])
  const sw = size ? Math.max(1, size.w / 600) : 2

  function down(e: React.PointerEvent) {
    if (!size) return
    if (tool === 'pan') { drag.current = { x: e.clientX, y: e.clientY, sl: wrap.current!.scrollLeft, st: wrap.current!.scrollTop }; return }
    if (tool === 'erase') return
    const [x, y] = toPage(e)
    const id = crypto.randomUUID().slice(0, 8)
    if (tool === 'text') {
      if (!text.trim()) { setMsg({ error: 'Type your note in the text box first, then click the sheet.' }); return }
      setMine((m) => [...m, { id, t: 'text', c: color, w: 1, x, y, text: text.trim(), size: sw * 9 }]); return
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (tool === 'pen') setDraft({ id, t: 'pen', c: color, w: sw, pts: [[x, y]] })
    if (tool === 'rect' || tool === 'cloud') setDraft({ id, t: tool, c: color, w: sw, x, y, wd: 0, ht: 0 })
    if (tool === 'arrow') setDraft({ id, t: 'arrow', c: color, w: sw, x1: x, y1: y, x2: x, y2: y })
  }
  function move(e: React.PointerEvent) {
    if (drag.current) { wrap.current!.scrollLeft = drag.current.sl - (e.clientX - drag.current.x); wrap.current!.scrollTop = drag.current.st - (e.clientY - drag.current.y); return }
    if (!draft) return
    const [x, y] = toPage(e)
    if (draft.t === 'pen') setDraft({ ...draft, pts: [...draft.pts, [x, y]] })
    else if (draft.t === 'rect' || draft.t === 'cloud') setDraft({ ...draft, wd: x - draft.x, ht: y - draft.y })
    else if (draft.t === 'arrow') setDraft({ ...draft, x2: x, y2: y })
  }
  function up() {
    drag.current = null
    if (!draft) return
    const tiny = (draft.t === 'rect' || draft.t === 'cloud') ? Math.abs(draft.wd) + Math.abs(draft.ht) < 4
      : draft.t === 'arrow' ? Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) < 4 : draft.t === 'pen' ? draft.pts.length < 2 : false
    if (!tiny) setMine((m) => [...m, norm(draft)])
    setDraft(null)
  }
  const save = () => start(async () => {
    const r = await saveMarkup(sheetId, vNum, visibility, mine)
    if ('error' in r && r.error) setMsg({ error: r.error })
    else { setSaved((s) => ({ ...s, [vNum]: { shapes: mine, visibility } })); setMsg({ ok: 'Markup saved.' }) }
  })

  const tools: [Tool, React.ReactNode, string][] = [
    ['pan', <Hand key="p" />, 'Pan'], ['pen', <PenLine key="pe" />, 'Pen'], ['rect', <Square key="r" />, 'Rectangle'], ['cloud', <Cloud key="c" />, 'Revision cloud'],
    ['arrow', <ArrowUpRight key="a" />, 'Arrow'], ['text', <Type key="t" />, 'Text'], ['erase', <Eraser key="e" />, 'Erase'],
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <Select aria-label="Version" className="h-8 w-40" value={vNum} onChange={(e) => switchVersion(Number(e.target.value))}>
          {versions.map((x) => <option key={x.id} value={x.version}>Version {x.version}{x.version === currentVersion ? ' (current)' : ''}</option>)}
        </Select>
        {versions.length > 1 && (
          <Select aria-label="Compare with" className="h-8 w-40" value={compareNum ?? ''} onChange={(e) => { setCompareNum(e.target.value ? Number(e.target.value) : null); setLoading(true) }}>
            <option value="">Compare with…</option>
            {versions.filter((x) => x.version !== vNum).map((x) => <option key={x.id} value={x.version}>Version {x.version}</option>)}
          </Select>
        )}
        <div className="mx-1 h-6 w-px bg-border" />
        <div className="flex rounded-md border border-border" role="toolbar" aria-label="Markup tools">
          {tools.map(([t, icon, label]) => (
            <button key={t} type="button" aria-label={label} aria-pressed={tool === t} title={label} onClick={() => setTool(t)}
              className={cn('grid size-8 place-items-center text-text-2 [&_svg]:size-4', tool === t && 'bg-brand-soft text-brand')}>{icon}</button>
          ))}
        </div>
        {tool === 'text' && <Input aria-label="Markup text" className="h-8 w-48" placeholder="Note text, then click the sheet" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />}
        <div className="flex gap-1">
          {COLORS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setColor(c)} className={cn('size-6 rounded-full border-2', color === c ? 'border-text' : 'border-transparent')} style={{ background: c }} />)}
        </div>
        <Button size="sm" variant="ghost" aria-label="Undo" disabled={!mine.length} onClick={() => setMine((m) => m.slice(0, -1))}><Undo2 /></Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <Button size="sm" variant="ghost" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.1, (z ?? 1) / 1.25))}><Minus /></Button>
        <span className="w-12 text-center text-xs tabular-nums text-text-3">{zoom ? Math.round(zoom * 100) : 0}%</span>
        <Button size="sm" variant="ghost" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(8, (z ?? 1) * 1.25))}><Plus /></Button>
        <div className="ml-auto flex items-center gap-2">
          {others.length > 0 && <label className="flex items-center gap-1 text-xs text-text-2"><input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} className="accent-brand" /> Others&apos; markups ({others.length})</label>}
          <Select aria-label="Who sees my markup" className="h-8 w-36" value={visibility} onChange={(e) => setVisibility(e.target.value as Markup['visibility'])}>
            <option value="private">Only me</option>
            {canTeam && <option value="team">My team</option>}
            <option value="shared">Everyone on the sheet</option>
          </Select>
          <Button size="sm" variant="primary" onClick={save} disabled={pending || !dirty}><Save />{pending ? 'Saving…' : 'Save markup'}</Button>
        </div>
      </div>
      {cmp && <div className="flex gap-4 border-b border-border bg-surface-2 px-3 py-1 text-xs text-text-2"><GitCompare className="size-4" /> Comparing version {vNum} with version {cmp.version}: <span className="font-medium text-[#2563eb]">blue = added in v{vNum}</span><span className="font-medium text-[#dc2626]">red = removed since v{cmp.version}</span></div>}
      {msg.error && <Alert className="m-3">{msg.error}</Alert>}
      {msg.ok && <Alert tone="success" className="m-3">{msg.ok}</Alert>}
      <div ref={wrap} className="min-h-[60vh] flex-1 overflow-auto bg-surface-2 p-3" data-testid="plan-canvas-wrap">
        {!(size && zoom) && <div className="grid h-64 place-items-center text-[13px] text-text-3">Loading sheet…</div>}
        {size && zoom && (
          <div className="relative mx-auto shadow-md" style={{ width: size.w * zoom, height: size.h * zoom }}>
            <canvas ref={canvas} aria-label={`Sheet version ${vNum}`} className="absolute inset-0 size-full bg-white" />
            {loading && <div className="absolute inset-0 grid place-items-center text-[13px] text-text-3">Loading sheet…</div>}
            <svg ref={svg} viewBox={`0 0 ${size.w} ${size.h}`} className={cn('absolute inset-0 size-full touch-none', tool === 'pan' ? 'cursor-grab' : tool === 'erase' ? 'cursor-not-allowed' : 'cursor-crosshair')}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} data-testid="markup-layer">
              {showOthers && others.flatMap((m) => m.shapes.map((s) => <g key={`${m.author}-${s.id}`} opacity={0.75}><ShapeEl s={s} /></g>))}
              {mine.map((s) => <ShapeEl key={s.id} s={s} onErase={tool === 'erase' ? () => setMine((m) => m.filter((x) => x.id !== s.id)) : undefined} />)}
              {draft && <ShapeEl s={draft} />}
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
