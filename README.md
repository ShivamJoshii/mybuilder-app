# MyBuilder

Construction management for Canadian home builders, their subs and their clients.

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, Turbopack), TypeScript, Tailwind CSS 4 |
| Database, auth | Supabase (Postgres 17, Canada Central) with row level security |
| Tests | pgTAP (database rules), Vitest (units), Playwright (browser) |

Business rules that protect data (tenancy, roles, job access) live in Postgres
(`supabase/migrations`) so every client — web today, mobile later — gets the same rules.

## Run it locally

Needs Node 20.9+, pnpm and Docker.

```bash
pnpm install
pnpm db:start          # local Supabase (auth, API, Postgres, email catcher)
pnpm db:reset          # apply all migrations
cp .env.example .env.local   # fill keys from `pnpm exec supabase status`
pnpm dev               # http://127.0.0.1:3000
```

Emails sent locally (invites, sign-up confirmations) land in Mailpit at http://127.0.0.1:54324.

## Tests

```bash
pnpm db:test     # tenant isolation + permission tests
pnpm typecheck
pnpm test:e2e    # browser tests (needs pnpm dev or starts it)
```

## Layout

```
supabase/migrations   schema, RLS, RPCs (source of truth)
supabase/tests        pgTAP tests
src/app               routes
src/lib/supabase      clients + generated database types (pnpm db:types)
docs/                 decisions and specs
```

See `PROGRESS.md` for what's built and what's next.
