import 'server-only'
import { createHash } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/** Standard PDF fonts only cover Latin-1; anything else becomes '?'. */
const latin1 = (t: string) => t.replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, '...').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?')

export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

type Signer = { label: string; signer_name: string | null; signature: string | null; decided_at: string | null; ip: string | null; user_agent: string | null; email?: string | null }

/** Original PDF + a signature certificate page (signatures, times, IPs and the original's SHA-256). */
export async function stampCertificate(original: Uint8Array, info: { title: string; company: string; sentAt: string; completedAt: string; hash: string; tz: string }, signers: Signer[]) {
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true })
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic)
  const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: info.tz, dateStyle: 'medium', timeStyle: 'long' }).format(new Date(iso)) : '')
  let page = pdf.addPage([612, 792])
  let y = 740
  // wraps to the page width
  const text = (t: string, size = 10, f = font, color = rgb(0.1, 0.1, 0.15)) => {
    let line = ''
    const flush = () => { page.drawText(line, { x: 50, y, size, font: f, color }); y -= size + 6; line = '' }
    for (const w of latin1(t).split(' ')) {
      const next = line ? `${line} ${w}` : w
      if (f.widthOfTextAtSize(next, size) > 512 && line) { flush(); line = w } else line = next
    }
    if (line) flush()
  }
  text('Signature certificate', 18, bold)
  text(info.title, 12, bold)
  text(`Sent by ${info.company} · ${fmt(info.sentAt)}`)
  text(`Completed ${fmt(info.completedAt)}`)
  text(`Original document SHA-256: ${info.hash}`, 8)
  y -= 10
  for (const s of signers) {
    if (y < 150) { page = pdf.addPage([612, 792]); y = 740 }
    page.drawLine({ start: { x: 50, y: y + 4 }, end: { x: 562, y: y + 4 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.85) })
    y -= 10
    text(s.label, 11, bold)
    text(`Signed by ${s.signer_name ?? ''}${s.email ? ` <${s.email}>` : ''}`, 9)
    if (s.signature?.startsWith('typed:')) { page.drawText(latin1(s.signature.slice(6)).slice(0, 60), { x: 60, y: y - 14, size: 24, font: italic }); y -= 40 }
    else if (s.signature?.startsWith('data:image/png;base64,')) {
      try {
        const img = await pdf.embedPng(Buffer.from(s.signature.split(',')[1], 'base64'))
        const h = 48, w = Math.min(240, (img.width / img.height) * h)
        page.drawImage(img, { x: 60, y: y - h + 6, width: w, height: h }); y -= h + 6
      } catch { text('[drawn signature could not be rendered]', 9) }
    }
    text(`Signed ${fmt(s.decided_at)}${s.ip ? ` · IP ${s.ip}` : ''}`, 9)
    if (s.user_agent) text(s.user_agent, 7, font, rgb(0.4, 0.4, 0.45))
    y -= 6
  }
  text('Signed electronically through MyBuilder. Each signer agreed that their electronic signature is the legal equivalent of their handwritten signature.', 7, font, rgb(0.4, 0.4, 0.45))
  return pdf.save()
}
