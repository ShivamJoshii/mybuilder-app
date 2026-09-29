import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { can, hasAction, type AppContext } from '@/lib/context'
import { formatCAD, formatDate, todayIn } from '@/lib/utils'
import { addDays as isoAddDays } from '@/lib/overtime'

export type WidgetItem = { id: string; label: string; sub?: string; href: string; flag?: 'overdue' | 'today' | 'soon' }
export type Widget = { key: string; title: string; href: string; items: WidgetItem[]; total: number; empty: string }

const take = (items: WidgetItem[], n = 6) => items.slice(0, n)
const w = (key: string, title: string, href: string, items: WidgetItem[], empty: string): Widget => ({ key, title, href, items: take(items), total: items.length, empty })

/** "Needs attention" for the jobs in view. Every query goes through RLS, so each role sees only its own slice. */
export async function summaryWidgets(ctx: AppContext, jobIds: string[]): Promise<Widget[]> {
  if (!jobIds.length) return []
  const supabase = await createClient()
  const today = todayIn()
  const week = isoAddDays(today, 7)
  const fortnight = isoAddDays(today, 14)
  const mode = ctx.workspace.mode
  const myOrgs = ctx.orgs.map((o) => o.org_id)
  const jobName = new Map(ctx.jobs.map((j) => [j.id, j.title]))
  const job = (id: string) => (jobIds.length > 1 ? jobName.get(id) ?? '' : '')
  const flag = (d: string | null | undefined): WidgetItem['flag'] => (!d ? undefined : d < today ? 'overdue' : d === today ? 'today' : d <= week ? 'soon' : undefined)
  const out: Widget[] = []
  const builder = mode === 'builder'
  const see = (m: string) => builder && can(ctx, m)

  const q = {
    todos: mode !== 'client' ? supabase.from('todos').select('id,title,due_at,job_id,todo_assignees(user_id,sub_org_id)').in('job_id', jobIds).is('completed_at', null).is('deleted_at', null).order('due_at', { nullsFirst: false }).limit(200) : null,
    schedule: supabase.from('schedule_items').select('id,title,start_date,end_date,job_id,completed_at,schedule_assignees(user_id,sub_org_id,status)').in('job_id', jobIds).is('deleted_at', null).is('completed_at', null).lte('start_date', mode === 'client' ? fortnight : week).gte('end_date', today).order('start_date').limit(200),
    rfis: mode !== 'client' ? supabase.from('rfis').select('id,number,title,status,due_date,job_id,assignee_user_id,assignee_sub_org_id,created_by').in('job_id', jobIds).in('status', ['sent', 'reopened']).is('deleted_at', null).order('due_date').limit(100) : null,
    cos: mode !== 'sub' ? supabase.from('change_orders').select('id,number,title,status,requested_by_client,approval_deadline,job_id').in('job_id', jobIds).in('status', mode === 'client' ? ['pending'] : ['pending', 'draft']).limit(100) : null,
    selections: supabase.from('selections').select('id,title,status,deadline,job_id').in('job_id', jobIds).in('status', mode === 'client' ? ['pending'] : ['pending', 'selected']).is('deleted_at', null).order('deadline', { nullsFirst: false }).limit(100),
    proposals: mode === 'client' ? supabase.from('proposals').select('id,title,approval_deadline,job_id').in('job_id', jobIds).eq('status', 'released').limit(50) : null,
    invoices: mode !== 'sub' && (mode === 'client' || see('invoices')) ? supabase.from('client_invoices').select('id,number,title,due_date,job_id').in('job_id', jobIds).eq('status', 'released').is('deleted_at', null).order('due_date').limit(100) : null,
    bills: builder && can(ctx, 'bills', 'cost') && hasAction(ctx, 'bills.approve') ? supabase.from('bills').select('id,number,invoice_ref,title,job_id,vendor_name,sub:organizations!bills_sub_org_id_fkey(name)').in('job_id', jobIds).eq('status', 'submitted').is('deleted_at', null).limit(100) : null,
    pos: mode === 'sub' ? supabase.from('purchase_orders').select('id,number,title,job_id').eq('status', 'released').is('deleted_at', null).limit(50) : null,
    warranty: supabase.from('warranty_claims').select('id,number,title,status,priority,job_id').in('job_id', jobIds).in('status', ['open', 'scheduled']).is('deleted_at', null).limit(100),
    bids: mode === 'sub' ? supabase.rpc('my_bid_requests') : null,
  }
  const [todos, schedule, rfis, cos, selections, proposals, invoices, bills, pos, warranty, bids] = await Promise.all([
    q.todos, q.schedule, q.rfis, q.cos, q.selections, q.proposals, q.invoices, q.bills, q.pos, q.warranty, q.bids,
  ].map((p) => p ?? Promise.resolve({ data: null })))

  type Todo = { id: string; title: string; due_at: string | null; job_id: string; todo_assignees: { user_id: string | null; sub_org_id: string | null }[] }
  const mineTodo = (t: Todo) => t.todo_assignees.some((a) => a.user_id === ctx.userId || (a.sub_org_id != null && myOrgs.includes(a.sub_org_id)))
  if (todos.data) {
    const list = (todos.data as Todo[]).filter(mineTodo)
    out.push(w('todos', 'My to-dos', '/todos', list.map((t) => ({ id: t.id, label: t.title, sub: [t.due_at ? `Due ${formatDate(t.due_at)}` : '', job(t.job_id)].filter(Boolean).join(' · '), href: `/todos/${t.id}`, flag: flag(t.due_at?.slice(0, 10)) })), 'Nothing assigned to you.'))
  }

  type Item = { id: string; title: string; start_date: string; end_date: string; job_id: string; schedule_assignees: { user_id: string | null; sub_org_id: string | null; status: string }[] }
  if (schedule.data) {
    const items = (schedule.data as Item[]).filter((i) => mode !== 'sub' || i.schedule_assignees.some((a) => a.sub_org_id != null && myOrgs.includes(a.sub_org_id)))
    out.push(w('schedule', mode === 'client' ? 'Coming up on your project' : mode === 'sub' ? 'Your upcoming work' : 'Schedule this week', '/schedule',
      items.map((i) => {
        const pending = mode === 'sub' && i.schedule_assignees.some((a) => a.sub_org_id != null && myOrgs.includes(a.sub_org_id) && a.status === 'pending')
        return { id: i.id, label: i.title, sub: [i.start_date <= today ? `Until ${formatDate(i.end_date)}` : `Starts ${formatDate(i.start_date)}`, pending ? 'Please confirm' : '', job(i.job_id)].filter(Boolean).join(' · '), href: `/schedule/${i.id}`, flag: i.start_date <= today ? 'today' as const : undefined }
      }), 'Nothing scheduled.'))
  }

  type Rfi = { id: string; number: number; title: string; due_date: string; job_id: string; assignee_user_id: string | null; assignee_sub_org_id: string | null; created_by: string }
  if (rfis.data) {
    const list = (rfis.data as Rfi[]).filter((r) => r.assignee_user_id === ctx.userId || (r.assignee_sub_org_id != null && myOrgs.includes(r.assignee_sub_org_id)) || r.created_by === ctx.userId)
    out.push(w('rfis', 'Open RFIs', '/rfis', list.map((r) => ({ id: r.id, label: `#${r.number} ${r.title}`, sub: [`Due ${formatDate(r.due_date)}`, job(r.job_id)].filter(Boolean).join(' · '), href: `/rfis/${r.id}`, flag: flag(r.due_date) })), 'No open RFIs for you.'))
  }

  if (proposals.data) {
    for (const p of proposals.data as { id: string; title: string; approval_deadline: string | null }[])
      out.push(w(`proposal-${p.id}`, 'Proposal to review', `/proposals/${p.id}`, [{ id: p.id, label: p.title, sub: p.approval_deadline ? `Please respond by ${formatDate(p.approval_deadline)}` : 'Waiting for your signature', href: `/proposals/${p.id}`, flag: flag(p.approval_deadline) }], ''))
  }

  type Co = { id: string; number: number; title: string; status: string; requested_by_client: boolean; approval_deadline: string | null; job_id: string }
  if (cos.data && (mode === 'client' || see('change_orders'))) {
    const list = (cos.data as Co[]).filter((c) => c.status === 'pending' || c.requested_by_client)
    out.push(w('cos', mode === 'client' ? 'Change orders to approve' : 'Change orders waiting', '/change-orders',
      list.map((c) => ({ id: c.id, label: `#${c.number} ${c.title}`, sub: [c.status === 'pending' ? (mode === 'client' ? 'Needs your signature' : 'Waiting for the client') : 'Client requested — needs pricing', job(c.job_id)].filter(Boolean).join(' · '), href: `/change-orders/${c.id}`, flag: flag(c.approval_deadline) })),
      mode === 'client' ? 'Nothing to approve.' : 'Nothing waiting.'))
  }

  type Sel = { id: string; title: string; status: string; deadline: string | null; job_id: string }
  if (selections.data && (mode !== 'builder' || see('selections'))) {
    const list = selections.data as Sel[]
    if (mode !== 'sub') out.push(w('selections', mode === 'client' ? 'Selections to make' : 'Selections in progress', '/selections',
      list.map((s) => ({ id: s.id, label: s.title, sub: [s.status === 'selected' ? 'Chosen — ready to approve' : s.deadline ? `Choose by ${formatDate(s.deadline)}` : 'Awaiting choice', job(s.job_id)].filter(Boolean).join(' · '), href: `/selections/${s.id}`, flag: s.status === 'pending' ? flag(s.deadline) : undefined })),
      mode === 'client' ? 'No selections waiting on you.' : 'No open selections.'))
  }

  if (invoices.data) {
    type Inv = { id: string; number: number; title: string; due_date: string | null; job_id: string }
    out.push(w('invoices', mode === 'client' ? 'Invoices to pay' : 'Unpaid client invoices', '/invoices',
      (invoices.data as Inv[]).map((i) => ({ id: i.id, label: `#${i.number} ${i.title}`, sub: [i.due_date ? `Due ${formatDate(i.due_date)}` : '', job(i.job_id)].filter(Boolean).join(' · '), href: `/invoices/${i.id}`, flag: flag(i.due_date) })), 'All paid up.'))
  }

  if (bills.data) {
    type Bill = { id: string; number: number; invoice_ref: string | null; title: string; job_id: string; vendor_name: string | null; sub: { name: string } | null }
    out.push(w('bills', 'Bills to approve', '/bills?status=submitted',
      (bills.data as unknown as Bill[]).map((b) => ({ id: b.id, label: b.invoice_ref || `Bill #${b.number}`, sub: [b.sub?.name ?? b.vendor_name, job(b.job_id)].filter(Boolean).join(' · '), href: `/bills/${b.id}` })), 'No bills waiting.'))
  }

  if (pos.data) {
    type Po = { id: string; number: number; title: string; job_id: string }
    out.push(w('pos', 'Purchase orders to accept', '/purchase-orders', (pos.data as Po[]).map((p) => ({ id: p.id, label: `PO #${p.number} ${p.title}`, sub: jobName.get(p.job_id), href: `/purchase-orders/${p.id}`, flag: 'today' as const })), 'Nothing to accept.'))
  }

  if (bids.data) {
    type Bid = { request_id: string; package_id: string; title: string; due_at: string | null; package_status: string; status: string; builder_name: string }
    const open = (bids.data as Bid[]).filter((b) => b.package_status === 'open' && b.status === 'invited')
    out.push(w('bids', 'Bid requests', '/bids', open.map((b) => ({ id: b.request_id, label: b.title, sub: [b.builder_name, b.due_at ? `Due ${formatDate(b.due_at)}` : ''].filter(Boolean).join(' · '), href: `/bids/${b.package_id}`, flag: flag(b.due_at?.slice(0, 10)) })), 'No open bid requests.'))
  }

  if (warranty.data && (mode !== 'builder' || see('warranties'))) {
    type Wc = { id: string; number: number; title: string; status: string; priority: string; job_id: string }
    const list = warranty.data as Wc[]
    if (list.length || mode === 'builder') out.push(w('warranty', 'Open warranty claims', '/warranty', list.map((c) => ({ id: c.id, label: `#${c.number} ${c.title}`, sub: [c.status === 'scheduled' ? 'Visit booked' : 'Needs a visit', job(c.job_id)].filter(Boolean).join(' · '), href: `/warranty/${c.id}`, flag: c.priority === 'urgent' ? 'overdue' as const : undefined })), 'No open claims.'))
  }

  return out.filter((x) => x.total > 0 || ['todos', 'schedule'].includes(x.key))
}

/** Money snapshot for one job (builder with budget cost access). */
export async function jobMoney(jobId: string) {
  const supabase = await createClient()
  const { data } = await supabase.rpc('job_budget', { p_job: jobId })
  if (!data) return null
  const s = (k: 'original_price' | 'co_price' | 'original_cost' | 'co_cost' | 'committed' | 'actual') => data.reduce((t, r) => t + Number(r[k] ?? 0), 0)
  return { contract: formatCAD(s('original_price') + s('co_price')), budget: formatCAD(s('original_cost') + s('co_cost')), committed: formatCAD(s('committed')), actual: formatCAD(s('actual')) }
}
