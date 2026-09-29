# Going live

Everything runs locally today. These steps put MyBuilder on the internet. Roughly an afternoon, most of it waiting on DNS.

## 1. Database — Supabase (Canada)

1. Create a project in **ca-central-1** (Canada, Central). The free tier is fine for a pilot; Pro ($25 US/mo) adds daily backups and no pausing.
2. Link and push the schema:
   ```sh
   pnpm exec supabase link --project-ref <ref>
   pnpm exec supabase db push          # applies every file in supabase/migrations
   ```
3. Dashboard → Database → Extensions: confirm **pg_cron** is on (the reminders job schedules itself; if the extension was off, re-run the last migration or `select cron.schedule('mybuilder-reminders','*/15 * * * *','select private.run_reminders()')`).
4. Auth → URL configuration: Site URL = `https://app.mybuilder.ca`; add it to redirect URLs.
5. Auth → SMTP: point at Postmark (step 4) so sign-up and password emails come from your domain.
6. Keep the **service role / secret key** server-side only.

## 2. File storage — Cloudflare R2 (or Supabase Storage)

R2 has no egress fees, which matters for plan sets and photos.
1. Create bucket `mybuilder-files` (location hint: ENAM or leave automatic).
2. Create an API token with Object Read & Write on that bucket.
3. CORS on the bucket: allow `PUT, GET` from `https://app.mybuilder.ca` with header `Content-Type`.

## 3. Web app — Vercel

1. Import the GitHub repo; framework Next.js; build `pnpm build`.
2. Functions region: the one nearest the database (Montréal if your plan offers it, otherwise Washington, D.C. `iad1`).
3. Environment variables (Production):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
   | `SUPABASE_SECRET_KEY` | Supabase secret key |
   | `NEXT_PUBLIC_SITE_URL` | `https://app.mybuilder.ca` |
   | `STORAGE_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` |
   | `STORAGE_REGION` | `auto` |
   | `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | R2 token |
   | `STORAGE_BUCKET` | `mybuilder-files` |
   | `POSTMARK_SERVER_TOKEN` | Postmark server token |
   | `EMAIL_FROM` | `notifications@mybuilder.ca` |
   | `INBOUND_DOMAIN` | `in.mybuilder.ca` |
   | `INBOUND_WEBHOOK_SECRET` | long random string |
   | `CRON_SECRET` | long random string |

4. Domain: add `app.mybuilder.ca` (CNAME to Vercel).
5. `vercel.json` already schedules `/api/cron/deliver` every minute (needs Vercel Pro; on Hobby, call it from Supabase instead:
   `select cron.schedule('deliver-email','* * * * *', $$ select net.http_get('https://app.mybuilder.ca/api/cron/deliver', headers => jsonb_build_object('Authorization','Bearer <CRON_SECRET>')) $$);` with the `pg_net` extension on).

## 4. Email — Postmark

1. Add sender domain `mybuilder.ca`; add the DKIM and Return-Path DNS records it shows.
2. Outbound stream: copy the server token into `POSTMARK_SERVER_TOKEN`.
3. Inbound (job email replies): MX record for `in.mybuilder.ca` → `inbound.postmarkapp.com` (priority 10); inbound webhook URL
   `https://postmark:<INBOUND_WEBHOOK_SECRET>@app.mybuilder.ca/api/inbound/postmark`.

## 5. Smoke test after the first deploy

- Sign up, create a company, a job, invite yourself as a client from another email, accept.
- Upload a PDF, request a signature, sign from the client account, download the signed copy.
- Send a job email and reply to it from your mail client; the reply lands in the job's thread.
- Check Settings → Audit log shows the changes.

## Local development

```sh
pnpm install
pnpm db:start && pnpm db:reset && pnpm db:types
cp .env.example .env.local   # fill from `pnpm exec supabase status`
pnpm dev
pnpm db:test && pnpm test && pnpm build && pnpm test:e2e
```
