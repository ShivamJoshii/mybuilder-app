'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAppContext, can, type AppContext } from '@/lib/context'
import { IMPORTERS, IMPORT_MAX_ROWS, type ImportKind } from '@/lib/importers'
import { parseBool, parseDate, parseMoney } from '@/lib/csv-parse'
import { PROVINCES } from '@/lib/utils'

type Row = Record<string, string>
export type ImportResult = { error?: string; created?: number; skipped?: { row: number; reason: string }[] }

const clean = (v: string | undefined, max: number) => { const t = (v ?? '').trim(); return t ? t.slice(0, max) : null }
const province = (v: string | undefined) => {
  const t = (v ?? '').trim().toUpperCase()
  if (!t) return null
  const hit = PROVINCES.find(([code, name]) => code === t || name.toUpperCase() === t)
  return hit ? hit[0] : undefined
}
const postal = (v: string | undefined) => {
  const t = (v ?? '').replace(/[\s-]/g, '').toUpperCase()
  if (!t) return null
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(t) ? `${t.slice(0, 3)} ${t.slice(3)}` : undefined
}
const JOB_STATUS: Record<string, 'open' | 'presale' | 'warranty' | 'closed'> = {
  open: 'open', active: 'open', 'in progress': 'open', presale: 'presale', 'pre sale': 'presale', 'pre-sale': 'presale', warranty: 'warranty', closed: 'closed', complete: 'closed', completed: 'closed',
}

/** Imports up to 2,000 rows of one kind. Each row succeeds or is reported back; nothing is half-written. */
export async function importRows(kind: ImportKind, rows: Row[]): Promise<ImportResult> {
  const ctx = await getAppContext()
  const def = IMPORTERS[z.enum(['jobs', 'leads', 'subs', 'cost_codes']).parse(kind)]
  if (ctx.workspace.mode !== 'builder' || !can(ctx, def.module, 'add')) return { error: `You don’t have permission to add ${def.label.toLowerCase()}.` }
  const data = z.array(z.record(z.string(), z.string().max(20000))).max(IMPORT_MAX_ROWS).parse(rows)
  const out = await IMPORT[kind](ctx, data)
  revalidatePath('/', 'layout')
  return out
}

const IMPORT: Record<ImportKind, (ctx: AppContext, rows: Row[]) => Promise<ImportResult>> = {
  async jobs(ctx, rows) {
    const supabase = await createClient()
    const org = ctx.workspace.mode === 'builder' ? ctx.workspace.orgId : ''
    const seePrice = can(ctx, 'jobs', 'price')
    const { data: o } = await supabase.from('organizations').select('province').eq('id', org).single()
    const homeProv = o?.province ?? 'AB'
    const skipped: ImportResult['skipped'] = []
    let created = 0
    for (const [i, r] of rows.entries()) {
      const n = i + 2
      const title = clean(r.title, 120)
      if (!title) { skipped.push({ row: n, reason: 'Job name is empty' }); continue }
      const status = r.status?.trim() ? JOB_STATUS[r.status.trim().toLowerCase()] : 'open'
      const prov = province(r.province), pc = postal(r.postal_code)
      const start = parseDate(r.projected_start ?? ''), end = parseDate(r.projected_end ?? ''), price = parseMoney(r.contract_price ?? '')
      if (!status) { skipped.push({ row: n, reason: `Unknown status “${r.status}”` }); continue }
      if (prov === undefined) { skipped.push({ row: n, reason: `Unknown province “${r.province}”` }); continue }
      if (pc === undefined) { skipped.push({ row: n, reason: `Postal code “${r.postal_code}” isn’t Canadian` }); continue }
      if (start === undefined || end === undefined) { skipped.push({ row: n, reason: 'A date couldn’t be read' }); continue }
      if (price === undefined) { skipped.push({ row: n, reason: 'Contract price isn’t a number' }); continue }
      const { data, error } = await supabase.from('jobs').insert({
        org_id: org, title, status, job_type: clean(r.job_type, 60), street: clean(r.street, 200), city: clean(r.city, 100),
        province: prov ?? homeProv, postal_code: pc, permit_number: clean(r.permit_number, 60), lot_info: clean(r.lot_info, 200),
        projected_start: start, projected_end: end && start && end < start ? null : end,
      }).select('id').single()
      if (error || !data) { skipped.push({ row: n, reason: 'Could not save' }); continue }
      if (price != null && seePrice) await supabase.from('job_private').update({ contract_price: price }).eq('job_id', data.id)
      created++
    }
    return { created, skipped }
  },

  async leads(ctx, rows) {
    const supabase = await createClient()
    const org = ctx.workspace.mode === 'builder' ? ctx.workspace.orgId : ''
    const [{ data: statuses }, { data: sources }] = await Promise.all([
      supabase.from('lead_statuses').select('id,name,category,sort').eq('org_id', org).order('sort'),
      supabase.from('lead_sources').select('id,name').eq('org_id', org),
    ])
    const defaultStatus = (statuses ?? []).find((s) => s.category === 'open')?.id
    const byName = <T extends { id: string; name: string }>(list: T[] | null, v: string) => (list ?? []).find((x) => x.name.toLowerCase() === v.trim().toLowerCase())?.id
    const skipped: ImportResult['skipped'] = []
    let created = 0
    for (const [i, r] of rows.entries()) {
      const n = i + 2
      const title = clean(r.title, 120)
      if (!title) { skipped.push({ row: n, reason: 'Title is empty' }); continue }
      const status = r.status?.trim() ? byName(statuses, r.status) : defaultStatus
      if (!status) { skipped.push({ row: n, reason: `Unknown status “${r.status}” — add it in Settings → Sales first` }); continue }
      const source = r.source?.trim() ? byName(sources, r.source) : undefined
      const email = clean(r.contact_email, 200)
      if (email && !z.string().email().safeParse(email).success) { skipped.push({ row: n, reason: `Email “${email}” isn’t valid` }); continue }
      const min = parseMoney(r.est_revenue_min ?? ''), max = parseMoney(r.est_revenue_max ?? ''), date = parseDate(r.projected_sale_date ?? '')
      const conf = r.confidence?.trim() ? Number(r.confidence.replace('%', '')) : null
      if (min === undefined || max === undefined || date === undefined || (conf != null && !(conf >= 0 && conf <= 100))) { skipped.push({ row: n, reason: 'A number or date couldn’t be read' }); continue }
      const prov = province(r.site_province)
      const { error } = await supabase.from('leads').insert({
        org_id: org, title, status_id: status, contact_first: clean(r.contact_first, 80) ?? '', contact_last: clean(r.contact_last, 80) ?? '',
        contact_email: email, contact_phone: clean(r.contact_phone, 40), site_street: clean(r.site_street, 200), site_city: clean(r.site_city, 100),
        site_province: prov ?? null, site_postal: postal(r.site_postal) ?? null, confidence: conf, est_revenue_min: min, est_revenue_max: max,
        projected_sale_date: date, source_ids: source ? [source] : [], notes: clean(r.notes, 8000),
      })
      if (error) { skipped.push({ row: n, reason: 'Could not save' }); continue }
      created++
    }
    return { created, skipped }
  },

  async subs(ctx, rows) {
    const supabase = await createClient()
    const org = ctx.workspace.mode === 'builder' ? ctx.workspace.orgId : ''
    const { data: links } = await supabase.from('builder_sub_links').select('primary_email').eq('builder_org_id', org)
    const have = new Set((links ?? []).map((l) => (l.primary_email ?? '').toLowerCase()))
    const skipped: ImportResult['skipped'] = []
    let created = 0
    for (const [i, r] of rows.entries()) {
      const n = i + 2
      const name = clean(r.company_name, 120), email = clean(r.email, 200)?.toLowerCase()
      if (!name || !email) { skipped.push({ row: n, reason: 'Company and email are required' }); continue }
      if (!z.string().email().safeParse(email).success) { skipped.push({ row: n, reason: `Email “${email}” isn’t valid` }); continue }
      if (have.has(email)) { skipped.push({ row: n, reason: `${email} is already in your list` }); continue }
      const { error } = await supabase.rpc('add_sub_vendor', {
        p_builder: org, p_company_name: name, p_email: email, p_trade: clean(r.trade, 80) ?? undefined, p_contact_first: clean(r.first, 80) ?? undefined,
        p_contact_last: clean(r.last, 80) ?? undefined, p_phone: clean(r.phone, 40) ?? undefined,
      })
      if (error) { skipped.push({ row: n, reason: 'Could not save' }); continue }
      have.add(email); created++
    }
    return { created, skipped }
  },

  async cost_codes(ctx, rows) {
    const supabase = await createClient()
    const org = ctx.workspace.mode === 'builder' ? ctx.workspace.orgId : ''
    const [{ data: cats }, { data: codes }] = await Promise.all([
      supabase.from('cost_categories').select('id,name').eq('org_id', org),
      supabase.from('cost_codes').select('code').eq('org_id', org),
    ])
    const catId = new Map((cats ?? []).map((c) => [c.name.toLowerCase(), c.id]))
    const have = new Set((codes ?? []).map((c) => c.code.toLowerCase()))
    const skipped: ImportResult['skipped'] = []
    let created = 0
    for (const [i, r] of rows.entries()) {
      const n = i + 2
      const code = clean(r.code, 20), title = clean(r.title, 120)
      if (!code || !title) { skipped.push({ row: n, reason: 'Code and title are required' }); continue }
      if (have.has(code.toLowerCase())) { skipped.push({ row: n, reason: `Code ${code} already exists` }); continue }
      const catName = clean(r.category, 80) ?? 'Imported'
      let cat = catId.get(catName.toLowerCase())
      if (!cat) {
        const { data } = await supabase.from('cost_categories').insert({ org_id: org, name: catName, sort: 1000 }).select('id').single()
        if (!data) { skipped.push({ row: n, reason: `Could not create category ${catName}` }); continue }
        cat = data.id; catId.set(catName.toLowerCase(), cat)
      }
      const { error } = await supabase.from('cost_codes').insert({ org_id: org, category_id: cat, code, title, is_labor: parseBool(r.is_labor ?? ''), sort: 1000 })
      if (error) { skipped.push({ row: n, reason: 'Could not save' }); continue }
      have.add(code.toLowerCase()); created++
    }
    return { created, skipped }
  },
}
