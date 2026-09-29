import type { LucideIcon } from 'lucide-react'
import {
  BarChart3, Calculator, CalendarDays, CheckSquare, ClipboardList, DollarSign, FileCheck2, FileQuestion,
  FileSignature, FileText, FolderOpen, Gavel, Hammer, Image as ImageIcon, Inbox, LayoutDashboard, ListChecks,
  MessageCircle, MessageSquare, NotebookPen, Receipt, ScrollText, ShieldCheck, ShoppingCart, Target, Timer,
  Users, Video, Wallet,
} from 'lucide-react'

export type Mode = 'builder' | 'sub' | 'client'

export type ModuleDef = {
  slug: string              // URL segment
  label: string
  module: string            // permission module key (app_modules.key)
  icon: LucideIcon
  modes: Mode[]
  jobScoped: boolean        // shows the job picker
  isNew?: boolean
  buildStep: number         // build order step from the plan
  emptyTitle: string
  emptyBody: string
}

// Every module in the product, in nav order. Pages that are not built yet render a
// placeholder from this registry so navigation, permissions and job scoping work now.
export const MODULES: ModuleDef[] = [
  { slug: 'leads', label: 'Lead opportunities', module: 'leads', icon: Target, modes: ['builder'], jobScoped: false, buildStep: 6,
    emptyTitle: 'Track every lead in one pipeline', emptyBody: 'Capture leads from your website, log calls and meetings, and convert sold leads into jobs.' },
  { slug: 'lead-activities', label: 'Lead activities', module: 'leads', icon: ListChecks, modes: ['builder'], jobScoped: false, buildStep: 6,
    emptyTitle: 'Never miss a follow-up', emptyBody: 'Calls, meetings and follow-ups for every lead, on a calendar.' },
  { slug: 'proposals', label: 'Proposals', module: 'proposals', icon: FileSignature, modes: ['builder', 'client'], jobScoped: false, buildStep: 7,
    emptyTitle: 'Send proposals clients can sign', emptyBody: 'Build proposals from your estimate and collect e-signatures.' },

  { slug: 'schedule', label: 'Schedule', module: 'schedule', icon: CalendarDays, modes: ['builder', 'sub', 'client'], jobScoped: true, buildStep: 5,
    emptyTitle: 'Plan the build', emptyBody: 'Calendar, list and Gantt views with dependencies, baselines and workday exceptions.' },
  { slug: 'daily-logs', label: 'Daily logs', module: 'daily_logs', icon: NotebookPen, modes: ['builder', 'sub', 'client'], jobScoped: true, buildStep: 3,
    emptyTitle: 'Record what happened on site', emptyBody: 'Notes, photos and weather for every day on the job.' },
  { slug: 'todos', label: 'To-dos', module: 'todos', icon: CheckSquare, modes: ['builder', 'sub'], jobScoped: true, isNew: true, buildStep: 3,
    emptyTitle: 'Assign work and track it', emptyBody: 'To-dos with checklists, due dates and reminders.' },
  { slug: 'change-orders', label: 'Change orders', module: 'change_orders', icon: FileCheck2, modes: ['builder', 'sub', 'client'], jobScoped: true, buildStep: 8,
    emptyTitle: 'Get changes approved in writing', emptyBody: 'Price changes, collect client signatures and update the budget automatically.' },
  { slug: 'selections', label: 'Selections', module: 'selections', icon: ClipboardList, modes: ['builder', 'sub', 'client'], jobScoped: true, buildStep: 8,
    emptyTitle: 'Let clients choose finishes', emptyBody: 'Options, allowances and approvals with deadlines tied to the schedule.' },
  { slug: 'warranty', label: 'Warranty', module: 'warranties', icon: ShieldCheck, modes: ['builder', 'sub', 'client'], jobScoped: true, buildStep: 11,
    emptyTitle: 'Handle warranty claims', emptyBody: 'Claims, service appointments and feedback in one place.' },
  { slug: 'plans', label: 'Plans and specs', module: 'specs', icon: ScrollText, modes: ['builder', 'sub'], jobScoped: true, isNew: true, buildStep: 8,
    emptyTitle: 'Share the latest plans', emptyBody: 'Upload plan sheets and publish specifications to your team and trades.' },
  { slug: 'submittals', label: 'Submittals', module: 'submittals', icon: Inbox, modes: ['builder', 'sub'], jobScoped: true, isNew: true, buildStep: 8,
    emptyTitle: 'Track submittals to approval', emptyBody: 'Shop drawings, samples and product data with a clear ball-in-court.' },
  { slug: 'time-clock', label: 'Time clock', module: 'time_clock', icon: Timer, modes: ['builder'], jobScoped: true, buildStep: 13,
    emptyTitle: 'Track hours by job', emptyBody: 'Clock in and out, approve shifts and push hours to job costing.' },

  { slug: 'documents', label: 'Documents', module: 'files', icon: FolderOpen, modes: ['builder', 'sub', 'client'], jobScoped: true, buildStep: 3,
    emptyTitle: 'Add a folder', emptyBody: 'Organize your documents, photos and videos. Add a folder to start uploading files.' },
  { slug: 'photos', label: 'Photos', module: 'files', icon: ImageIcon, modes: ['builder', 'sub', 'client'], jobScoped: true, buildStep: 3,
    emptyTitle: 'Add a folder', emptyBody: 'Organize your documents, photos and videos. Add a folder to start uploading files.' },
  { slug: 'videos', label: 'Videos', module: 'files', icon: Video, modes: ['builder', 'sub', 'client'], jobScoped: true, buildStep: 3,
    emptyTitle: 'Add a folder', emptyBody: 'Organize your documents, photos and videos. Add a folder to start uploading files.' },

  { slug: 'comments', label: 'Comments', module: 'messages', icon: MessageSquare, modes: ['builder', 'sub', 'client'], jobScoped: true, buildStep: 3,
    emptyTitle: 'Every comment in one place', emptyBody: 'Comments on logs, files and change orders, grouped by record.' },
  { slug: 'messages', label: 'Messages', module: 'messages', icon: MessageCircle, modes: ['builder', 'sub', 'client'], jobScoped: true, buildStep: 3,
    emptyTitle: 'Email, kept with the job', emptyBody: 'Send and receive email from the job so the whole history lives here.' },
  { slug: 'rfis', label: 'RFIs', module: 'rfis', icon: FileQuestion, modes: ['builder', 'sub'], jobScoped: true, buildStep: 3,
    emptyTitle: 'Clarify the unknown with RFIs', emptyBody: 'Ask questions, link them to plans and records, and track answers.' },

  { slug: 'estimates', label: 'Estimates', module: 'estimates', icon: Calculator, modes: ['builder'], jobScoped: true, buildStep: 7,
    emptyTitle: 'Estimate the job', emptyBody: 'Line items by cost code with markup, then send a proposal.' },
  { slug: 'bids', label: 'Bids', module: 'bids', icon: Gavel, modes: ['builder', 'sub'], jobScoped: false, buildStep: 9,
    emptyTitle: 'Collect bids from your trades', emptyBody: 'Send bid packages, compare pricing and award work.' },
  { slug: 'purchase-orders', label: 'Purchase orders', module: 'purchase_orders', icon: ShoppingCart, modes: ['builder', 'sub'], jobScoped: true, buildStep: 9,
    emptyTitle: 'Commit costs with POs', emptyBody: 'Issue POs, get trade sign-off and track work and payment status.' },
  { slug: 'bills', label: 'Bills', module: 'bills', icon: Receipt, modes: ['builder', 'sub'], jobScoped: true, buildStep: 9,
    emptyTitle: 'Pay trades on time', emptyBody: 'Bills from POs, approvals, holdback and lien waivers.' },
  { slug: 'budget', label: 'Budget', module: 'budget', icon: Wallet, modes: ['builder'], jobScoped: true, buildStep: 10,
    emptyTitle: 'Know where every dollar is', emptyBody: 'Original, revised, committed and actual costs by cost code.' },
  { slug: 'invoices', label: 'Invoices', module: 'invoices', icon: DollarSign, modes: ['builder', 'client'], jobScoped: true, buildStep: 10,
    emptyTitle: 'Bill your clients', emptyBody: 'Draws, progress billing, deposits and credit memos.' },
  { slug: 'reports', label: 'Reports', module: 'reports', icon: BarChart3, modes: ['builder'], jobScoped: false, buildStep: 10,
    emptyTitle: 'See the business at a glance', emptyBody: 'Work in progress, profitability, cash flow and labour reports.' },
]

export const MODULE_BY_SLUG = new Map(MODULES.map((m) => [m.slug, m]))

export type NavItem = { label: string; href: string; module?: string; isNew?: boolean; icon: LucideIcon }
export type NavGroup = { label: string; items: NavItem[] }

function items(slugs: string[], mode: Mode): NavItem[] {
  return slugs
    .map((s) => MODULE_BY_SLUG.get(s))
    .filter((m): m is ModuleDef => Boolean(m && m.modes.includes(mode)))
    .map((m) => ({ label: m.label, href: `/${m.slug}`, module: m.module, isNew: m.isNew, icon: m.icon }))
}

export function navFor(mode: Mode): NavGroup[] {
  const jobs: NavItem[] = [
    { label: 'Summary', href: '/summary', icon: LayoutDashboard },
    ...(mode !== 'client' ? [{ label: 'Jobs list', href: '/jobs', module: 'jobs', icon: Hammer }] : []),
  ]
  const groups: NavGroup[] = [{ label: 'Jobs', items: jobs }]
  if (mode === 'builder') groups.push({ label: 'Sales', items: items(['leads', 'lead-activities', 'proposals'], mode) })
  groups.push(
    { label: 'Project Management', items: items(['schedule', 'daily-logs', 'todos', 'change-orders', 'selections', 'warranty', 'plans', 'submittals', 'time-clock'], mode) },
    { label: 'Files', items: items(['documents', 'photos', 'videos'], mode) },
    { label: 'Messaging', items: items(['comments', 'messages', 'rfis'], mode) },
    { label: 'Financial', items: items(['estimates', ...(mode === 'client' ? ['proposals'] : []), 'bids', 'purchase-orders', 'bills', 'budget', 'invoices', 'reports'], mode) },
  )
  return groups.filter((g) => g.items.length > 0)
}

export const SETTINGS_NAV: { label: string; href: string; module?: string; action?: string; icon: LucideIcon }[] = [
  { label: 'Company', href: '/settings/company', action: 'settings.manage', icon: FileText },
  { label: 'Internal users', href: '/settings/users', module: 'internal_users', icon: Users },
  { label: 'Roles and permissions', href: '/settings/roles', module: 'internal_users', icon: ShieldCheck },
  { label: 'Subs and vendors', href: '/settings/subs', module: 'subs_vendors', icon: Hammer },
  { label: 'Cost codes', href: '/settings/cost-codes', module: 'cost_codes', icon: ListChecks },
  { label: 'Custom fields', href: '/settings/custom-fields', action: 'settings.manage', icon: ClipboardList },
  { label: 'Sales', href: '/settings/sales', action: 'settings.manage', icon: Target },
]
