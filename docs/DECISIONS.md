# Decisions

Short records of choices that shape the codebase. Newest last.

## 1. Postgres is the security boundary
Tenant isolation, roles and job access are enforced with row level security and
`SECURITY DEFINER` helpers in the `private` schema. The web app never gets a
service key in the browser, and a bug in UI code cannot leak another builder's data.

## 2. Three user types, one data model
- **Internal**: member of a builder org. Permissions come from a role.
- **Sub/vendor**: member of a sub org. A sub org links to many builders
  (`builder_sub_links`) and keeps a separate company profile per builder.
- **Client**: homeowner contact on a job (`job_clients.user_id`).

## 3. Roles
13 read-only templates (Org Owner … Purchasing Coordinator) are copied into each
builder org as locked built-in roles. Custom roles are clones (`clone_role`) and
are editable. A permission row = role × module × {view, add, edit, delete} +
scope (all / assigned / own) + see cost + see price. Named actions
(`bills.mark_paid`, `time_clock.approve`, …) sit beside them.

## 4. Job access
An internal user sees a job when: active member, role grants `jobs.view`, the
job's status is in the role's allowed statuses, and one of: member has
`all_jobs`, role scope for jobs is `all`, user is on `job_members`, or user
created the job.

## 5. Sensitive columns live in side tables
Contract price and internal notes are in `job_private`, readable only by internal
users with `jobs` price permission. Subs and clients can't read them even though
they can read the job row. Same pattern for future financial fields.

## 6. Canada first
Provinces (not states), postal codes, CAD, GST/HST/PST later on financial lines,
holdback instead of retainage, data in `ca-central-1`.

## 7. Local-first development
A full local Supabase stack (Docker) runs auth, API and Postgres. The same
migrations apply to the hosted project with `supabase db push`.
