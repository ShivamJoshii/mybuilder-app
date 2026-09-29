# Progress

Last updated: 2026-09-29 (overnight build)

## Status at a glance

| Area | State |
| --- | --- |
| Foundation: tenants, 13 roles + permission grid, jobs, cost codes, custom fields, audit log | Built, tested |
| Sign up, sign in, onboarding, invites (internal, sub, client) | Built, browser-tested |
| App shell: top nav, builder switcher, job picker, page header, search, bell | Built |
| Jobs: list (filters, sort, saved views), job page (subs, clients, team access, comments), create/edit | Built, browser-tested |
| Settings: company, client portal defaults, users, roles, subs/vendors, cost codes, custom fields, sales lists, web forms, notifications, profiles | Built |
| Shared kit: filter drawer, data grid, query-builder filter, saved views, record form (draft/publish, unsaved guard), comments, related items, confirm, print | Built |
| Comments module + global search | Built |
| To-dos (assignees incl. subs/clients, checklist, priority, reminders) | Built, browser-tested |
| Daily logs (live weather, tags, drafts, sharing, sub-authored logs) | Built, browser-tested |
| RFIs (numbering, send/complete/reopen, sub-raised, responses, related items) | Built, browser-tested |
| Notifications engine (37 event types, per-user email/text/push matrix, in-app bell, delivery outbox) | Built; email/SMS sending waits for Postmark/Twilio |
| Schedule (calendar, list, Gantt with dependencies + critical path + baseline, online/offline, confirmations, shift log, workday exceptions) | Built, browser-tested |
| Sales/CRM (leads, pipeline board, activities, convert to job, website lead forms) | Built, browser-tested |
| Files: documents, photos, videos (folders, versions, sharing, share links, attachments on logs/RFIs/to-dos) | Built, browser-tested (local S3 stands in for R2) |
| Estimating: worksheet (groups, optional groups, cost codes, markup %/$, provincial tax presets, catalog), price-only view for sales roles | Built, browser-tested |
| Proposals: frozen snapshot on release, client e-signature (typed or drawn, IP + user agent logged), builder can record on behalf, print | Built, browser-tested |
| Send to budget (locks estimate, writes original budget, sets contract price), unlock | Built, browser-tested |
| Change orders (numbered, cost worksheet, release for e-signature, approval updates budget + contract price, client change requests) | Built, browser-tested |
| Selections + allowances (choices with client price / builder cost, deadlines tied to schedule items, client picks, approval locks, overage/credit → draft change order, subs see without prices) | Built, browser-tested |
| Plans: upload a plan set PDF → one sheet per page with sheet numbers read from title blocks; viewer (zoom/pan), markups (pen, rectangle, revision cloud, arrow, text; private/team/shared), versions with overlay compare (red removed / blue added), sharing + notifications | Built, browser-tested |
| Specifications (divisions, plain-text body with bullets, sharing, print) | Built, browser-tested |
| Bids: packages with lines, invite linked subs (presale jobs too), subs price each line or decline, side-by-side compare, award → draft PO | Built, browser-tested |
| Purchase orders: lines by cost code, send to sub, sub accepts with signature, work status, holdback %, lien waiver flag | Built, browser-tested |
| Bills: sub-submitted or builder-entered, can't over-bill a PO line, GST, holdback withheld, approve/reject, lien waiver gate, record payment, holdback release | Built, browser-tested |
| Budget: original + change orders = revised, vs committed (POs) and actual (bills), remaining, projected profit | Built, browser-tested |
| Client invoices: draws by % of contract, fixed amounts, approved change orders; GST/HST; owner holdback; send to client; record payments; void | Built, browser-tested |
| Reports: work in progress (earned vs billed, over/under billing), receivables aging, payables aging | Built, browser-tested |
| Warranty: client requests (portal setting), assignment to team or sub, service visits the sub confirms/completes, internal notes kept private, client rating | Built, browser-tested |
| Chat: 1:1 and group conversations with team, job subs and job clients (membership checked server-side), unread counts, live updates (Supabase Realtime) | Built, browser-tested (two browsers) |
| Messages: job email with a per-job address; send from the job (Reply-To = job address), inbound webhook threads replies (In-Reply-To, then subject), notifications | Built, browser-tested; sending waits for Postmark keys (stays “Queued”) |
| Time clock: clock in/out by job + cost code with GPS, manual shifts, provincial overtime (AB 8/44 default), approve/reject, labour rates (admin-only), labour cost into budget and WIP, payroll CSV export | Built, browser-tested |
| Submittals: request from sub, numbered revisions with attachments, reviewer decisions (approved / as noted / revise / rejected), ball-in-court | Built, browser-tested |
| Summary dashboard: role-specific “needs attention” widgets, money snapshot, latest logs | Built |
| Global search across all modules | Built, browser-tested |
| Company logo + GST/HST (and QST) numbers on proposals, change orders, POs and invoices; invoices show “Bill to” | Built, browser-tested |
| Accounting: cost type / cost code → account mapping; QuickBooks-shaped CSV exports for bills and invoices; payments register | Built, browser-tested |
| Bid documents: pick plan sheets for a bid package; invited bidders open those sheets and the package attachments before they're on the job | Built, browser-tested |
| Custom fields on jobs, leads, daily logs, to-dos, RFIs and warranty claims: typed values, per-field visibility to subs / clients | Built, browser-tested |
| Sub compliance: WCB clearance / liability / auto / licence / COR certificates per builder with documents and expiry; subs file their own; required set + optional payment block; warnings on POs and bills | Built, browser-tested |
| Job templates: save any job as a template; new jobs copy its schedule (with links), to-dos + checklists, selections + choices, specs, estimate and folders, shifted to the new start date; templates never get subs/clients and stay out of "all jobs" | Built, browser-tested |
| Security audit (13 findings: invites, sub-link consent, share links, storage keys, holdbacks, audiences, prices, assignees) | Fixed, 24 regression tests |
| Direct QuickBooks Online / Xero sync (needs Intuit/Xero developer apps), online payments, mobile app | Later |
| Hosted Supabase project | **Blocked** — see "Needs you" |
| Push to GitHub | **Blocked** — see "Needs you" |

## Needs you

1. **Supabase project.** Creating `mybuilder` in the myBuilder org fails: both
   `shivamjoshi.close@gmail.com` and `ShivamJoshii` already have 2 active free projects
   (the limit counts every org where you're an admin). Pause/delete one project per login,
   or upgrade the org. Then I run the migrations against it (`supabase db push`).
2. **GitHub.** This workspace's git proxy only allows repos attached to the session, so
   the push to `ShivamJoshii/mybuilder-app` was refused (the token itself is fine).
   Add the repo as a session source, or connect a folder on your Mac. A git bundle of
   everything is attached in the chat meanwhile.
3. **Email (Postmark).** Set POSTMARK_SERVER_TOKEN, a verified sender (EMAIL_FROM), an inbound
   domain (MX for in.mybuilder.ca → Postmark) and INBOUND_WEBHOOK_SECRET. Until then invites show a
   copyable link and job email stays queued.
4. **Storage (Cloudflare R2).** Create a bucket + API token and set STORAGE_* (endpoint, keys, bucket).
   Locally Supabase Storage stands in.
5. **QuickBooks Online sync (later).** Needs an Intuit developer app (client ID/secret). CSV exports work today.

## Decisions I made on my own

- Postgres (Supabase) is the security boundary; see `docs/DECISIONS.md`.
- Contract price and internal notes live in `job_private`, hidden from subs, clients and
  roles without price permission.
- Built-in roles are locked copies of 13 templates; custom roles are cloned from them.
  Default permission toggles per role are my best reading of Buildertrend's role
  descriptions (`supabase/migrations/…_roles_and_rpcs.sql`) — review them.
- Job picker "All" = every job when unfiltered; with a status filter it selects exactly
  the jobs shown.
- Starter cost codes (29 codes in 6 categories) seeded for every new builder.
- Postal codes are validated as Canadian and stored as `A1A 1A1`.
- Map tab lists addresses until Google Maps is connected.
- Tax defaults by province: HST where it applies (ON 13, NS 14, NB/NL/PE 15), QC 14.975
  (GST+QST), GST 5% elsewhere. PST in BC/MB/SK is treated as part of material cost.
  Editable per estimate.
- E-signatures are captured in-house (no DocuSign); we store name, signature image or
  typed name, timestamp, IP and browser, plus the frozen proposal they signed.
- Subs don't see change orders (they carry client pricing); trade-side changes will come
  through purchase orders.
- Plans: our own viewer on pdf.js (legacy build for browser support); markups are vectors
  in PDF page units stored per version, so they survive zoom and never bleed into a new version.
- Holdback defaults to 10% per PO (editable); release creates a draft bill that requires a lien waiver.
- Releasing a PO to a sub adds them to the job (schedule, files, RFIs).
- Builder-only fields (schedule internal/sub/client notes, change order notes and markup, warranty notes) live in
  separate rows with their own RLS, so an audience can never read another audience's text through the API.
- Named permissions are enforced in the database, not just hidden in the UI: approving/paying bills,
  accepting POs for a sub, approving change orders and selections for a client, approving time.
- Payroll export is a generic CSV (name, email, period, regular/OT hours); the exact Wagepoint import
  mapping is still to confirm with a Wagepoint account.
- Forms keep what you typed when the server rejects it (React 19 otherwise resets forms after every action).
- Invited clients get a copyable invite link on the job page until email sending is on.
- Security audit fixes (migration `…003300_security_hardening`):
  - Adding a sub that already has a MyBuilder company creates a **pending** link; their admin accepts the
    emailed invite before the builder sees their people or can send them work. Subs the builder creates are linked at once.
  - Sub matching uses the verified login email; profile emails can't be edited through the API.
  - Invites and memberships can only be created by server functions; accepting re-checks the invite.
  - File, version, plan and logo storage keys must sit under the record's own folder; share links can't be repointed.
  - Subs can't change holdback or lien-waiver terms on their bills.
  - A sub's comments are seen by the builder and that sub's own company (and the client only if allowed); audiences can't be widened later.
  - "Notes for subs" moved to their own table so clients can't read them. Subs see selections without the allowance.
  - Change orders and selection prices need the price permission; recording a client's proposal approval needs the new
    "Approve proposals on behalf of a client" permission (given to roles that could already do this for change orders).
  - Schedule, warranty, lead and submittal assignees must belong to the company / job.

## Tests

| Suite | Count | Command |
| --- | --- | --- |
| Database (pgTAP): isolation, roles, subs, clients, invites, comments, to-dos, logs, RFIs, notifications, schedule, leads, files, estimates/proposals, change orders, selections, plans/specs, bids/POs/bills/budget, invoices/reports, warranty, private-notes checks, chat, messages, time clock, named permissions, submittals, security audit regressions, bid documents, custom fields, compliance, job templates | 355 | `pnpm db:test` |
| Unit (Vitest): workday calendar, dependency cascade, loops, critical path, estimate math, time zones, overtime, custom field parsing | 21 | `pnpm test` |
| Browser (Playwright): onboarding, jobs, views, comments, portals, to-dos, logs, RFIs, notifications, schedule, leads, files, estimate→proposal→signature→budget, change orders, selections, plans, bid→PO→bill→budget, invoices→reports, warranty, chat, messages, time clock, submittals, custom fields, compliance, job templates | 23 flows (run against a production build) | `pnpm test:e2e` |
| Lint, types, production build | clean | `pnpm lint && pnpm typecheck && pnpm build` |

## Next up (build order)

3. Files (documents/photos/videos) — needs the storage decision wired (Cloudflare R2 keys),
   then Messages (Postmark in/out), Daily logs with weather, To-dos, RFIs.
4. Notifications engine + settings matrix.
5. Schedule (Gantt licence decision: Bryntum).
6. Sales / CRM. 7. Estimating + proposals + e-signature. 8. Change orders, selections,
   allowances, specs, plans. 9. Bids → POs → bills. 10. Budget, invoices, reports.
   11. Client portal + warranty. 12. Accounting sync, AI client updates.
