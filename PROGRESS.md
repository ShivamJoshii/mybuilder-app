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
| Files, messages, chat, estimating, change orders, selections, bids/POs/bills, budget, invoices, warranty | Next, per build order |
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
3. **Email sending (later).** Invites currently show a copyable link. Postmark keys will
   switch that to real emails.

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

## Tests

| Suite | Count | Command |
| --- | --- | --- |
| Database (pgTAP): isolation, roles, subs, clients, invites, comments, to-dos, logs, RFIs, notifications, schedule, leads | 128 | `pnpm db:test` |
| Unit (Vitest): workday calendar, dependency cascade, loops, critical path | 9 | `pnpm test` |
| Browser (Playwright): onboarding, jobs, views, comments, portals, to-dos, logs, RFIs, notifications, schedule, leads | 9 flows | `pnpm test:e2e` |
| Lint, types, production build | clean | `pnpm lint && pnpm typecheck && pnpm build` |

## Next up (build order)

3. Files (documents/photos/videos) — needs the storage decision wired (Cloudflare R2 keys),
   then Messages (Postmark in/out), Daily logs with weather, To-dos, RFIs.
4. Notifications engine + settings matrix.
5. Schedule (Gantt licence decision: Bryntum).
6. Sales / CRM. 7. Estimating + proposals + e-signature. 8. Change orders, selections,
   allowances, specs, plans. 9. Bids → POs → bills. 10. Budget, invoices, reports.
   11. Client portal + warranty. 12. Accounting sync, AI client updates.
