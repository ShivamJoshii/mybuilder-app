# Progress

Last updated: 2026-09-29 (overnight build 1)

## Status at a glance

| Area | State |
| --- | --- |
| Database foundation (tenants, roles, jobs, cost codes, custom fields, audit log) | Built, tested |
| Row level security on every table | Built, 58 database tests passing |
| Sign up, sign in, onboarding, invites (internal, sub, client) | Built, browser-tested |
| App shell: top nav, builder switcher, job picker, page header pattern | Built |
| Jobs: list (filters, sort, saved views), job page, create/edit, soft delete | Built, browser-tested |
| Settings: company, client portal defaults, users, roles + permission grid, subs/vendors, cost codes, custom fields, sub company profiles, my profile | Built |
| Shared kit: filter drawer (date presets), data grid, record form with unsaved-changes guard, saved views, comments, confirm dialogs | Built |
| Comments module (conversations + feed) and global search | Built |
| All other modules (schedule, logs, files, money…) | Routed + permission-gated placeholders, per build order |
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
| Database (pgTAP): tenant isolation, roles, subs, clients, invites, comments | 58 | `pnpm db:test` |
| Browser (Playwright): builder onboarding, jobs, filters, saved views, comments, sub + crew portals | 3 flows | `pnpm test:e2e` |
| Lint, types, production build | clean | `pnpm lint && pnpm typecheck && pnpm build` |

## Next up (build order)

3. Files (documents/photos/videos) — needs the storage decision wired (Cloudflare R2 keys),
   then Messages (Postmark in/out), Daily logs with weather, To-dos, RFIs.
4. Notifications engine + settings matrix.
5. Schedule (Gantt licence decision: Bryntum).
6. Sales / CRM. 7. Estimating + proposals + e-signature. 8. Change orders, selections,
   allowances, specs, plans. 9. Bids → POs → bills. 10. Budget, invoices, reports.
   11. Client portal + warranty. 12. Accounting sync, AI client updates.
