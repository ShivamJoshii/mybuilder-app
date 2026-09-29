// Client-side PDF helpers (pdf.js). Import only from client components.
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'

// Legacy build: polyfills newer JS (e.g. Map.getOrInsertComputed) for current Safari/Chrome.
let lib: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null
export function pdfjs() {
  lib ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => { m.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'; return m })
  return lib
}

export async function openPdf(src: ArrayBuffer | string): Promise<PDFDocumentProxy> {
  const m = await pdfjs()
  return m.getDocument(typeof src === 'string' ? { url: src } : { data: new Uint8Array(src) }).promise
}

const SHEET_RE = /^[A-Z]{1,3}[-.]?\d{1,4}(?:\.\d{1,2})?[A-Z]?$/

/** Best guess at a sheet number: a sheet-number-looking string nearest the bottom-right corner. */
export async function guessSheetNumber(doc: PDFDocumentProxy, pageNo: number) {
  const page = await doc.getPage(pageNo)
  const vp = page.getViewport({ scale: 1 })
  const text = await page.getTextContent()
  let best: { s: string; score: number } | null = null
  for (const it of text.items) {
    if (!('str' in it)) continue
    const s = it.str.trim()
    if (!SHEET_RE.test(s)) continue
    const [x, y] = [it.transform[4], it.transform[5]]
    const score = x / vp.width - y / vp.height   // right and low scores higher
    if (!best || score > best.score) best = { s, score }
  }
  return best?.s ?? null
}

export const DISCIPLINES: Record<string, string> = {
  A: 'Architectural', S: 'Structural', M: 'Mechanical', E: 'Electrical', P: 'Plumbing', C: 'Civil', L: 'Landscape', G: 'General', I: 'Interiors', F: 'Fire protection',
}
export const disciplineFor = (num: string) => DISCIPLINES[num.charAt(0).toUpperCase()] ?? ''
