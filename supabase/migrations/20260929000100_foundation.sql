-- =====================================================================
-- MyBuilder foundation: tenants, users, roles & permissions, jobs,
-- cost codes, custom fields, tags, saved views, audit log.
--
-- Security model
--   * Every business table has RLS enabled. No table is readable without
--     a policy that ties the row to the caller (auth.uid()).
--   * Helper functions live in the `private` schema (not exposed through
--     the API) and are SECURITY DEFINER with an empty search_path.
--   * Three user types share the data:
--       internal  = member of a builder org (permissions come from a role)
--       sub       = member of a sub/vendor org linked to a builder
--       client    = homeowner contact on a job
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.org_kind       as enum ('builder', 'sub');
create type public.member_status  as enum ('active', 'inactive', 'archived');
create type public.job_status     as enum ('presale', 'open', 'warranty', 'closed');
create type public.contract_type  as enum ('fixed_price', 'open_book');
create type public.perm_scope     as enum ('all', 'assigned', 'own');
create type public.link_status    as enum ('active', 'inactive');
create type public.field_type     as enum ('text', 'long_text', 'number', 'currency', 'date',
                                           'boolean', 'single_select', 'multi_select',
                                           'file', 'hyperlink');
create type public.invite_kind    as enum ('internal', 'sub', 'client');
create type public.cost_type      as enum ('labor', 'material', 'equipment', 'subcontractor', 'other', 'none');

-- ---------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       extensions.citext not null,
  first_name  text not null default '',
  last_name   text not null default '',
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (email);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Organizations (builder companies and sub/vendor companies)
-- ---------------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  kind          public.org_kind not null,
  name          text not null check (length(trim(name)) > 0),
  legal_name    text,
  phone         text,
  email         extensions.citext,
  website       text,
  street        text,
  city          text,
  province      text,
  postal_code   text,
  country       text not null default 'CA',
  logo_url      text,
  timezone      text not null default 'America/Edmonton',
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger organizations_touch before update on public.organizations
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Modules (the rows of the permission grid)
-- ---------------------------------------------------------------------
create table public.app_modules (
  key         text primary key,
  label       text not null,
  area        text not null,     -- nav group: jobs, sales, project, files, messaging, financial, admin
  sort        int  not null,
  has_money   boolean not null default false  -- module shows cost / price columns
);

insert into public.app_modules (key, label, area, sort, has_money) values
  ('jobs',             'Jobs',               'jobs',       10, true),
  ('leads',            'Lead opportunities', 'sales',      20, true),
  ('proposals',        'Proposals',          'sales',      21, true),
  ('estimates',        'Estimates',          'financial',  30, true),
  ('bids',             'Bids',               'financial',  31, true),
  ('purchase_orders',  'Purchase orders',    'financial',  32, true),
  ('bills',            'Bills',              'financial',  33, true),
  ('budget',           'Budget',             'financial',  34, true),
  ('invoices',         'Client invoices',    'financial',  35, true),
  ('schedule',         'Schedule',           'project',    40, false),
  ('daily_logs',       'Daily logs',         'project',    41, false),
  ('todos',            'To-dos',             'project',    42, false),
  ('change_orders',    'Change orders',      'project',    43, true),
  ('selections',       'Selections',         'project',    44, true),
  ('warranties',       'Warranty',           'project',    45, false),
  ('specs',            'Plans and specs',    'project',    46, false),
  ('submittals',       'Submittals',         'project',    47, false),
  ('files',            'Files',              'files',      50, false),
  ('messages',         'Messages',           'messaging',  60, false),
  ('rfis',             'RFIs',               'messaging',  61, false),
  ('time_clock',       'Time clock',         'project',    70, true),
  ('subs_vendors',     'Subs and vendors',   'admin',      80, false),
  ('clients',          'Clients',            'admin',      81, false),
  ('internal_users',   'Internal users',     'admin',      82, false),
  ('cost_codes',       'Cost codes',         'admin',      83, false),
  ('reports',          'Reports',            'admin',      84, true),
  ('company_settings', 'Company settings',   'admin',      85, false),
  ('accounting',       'Accounting sync',    'admin',      86, true);

-- Named actions that sit beside view/add/edit/delete
create table public.app_actions (
  key         text primary key,
  module      text not null references public.app_modules (key),
  label       text not null
);

insert into public.app_actions (key, module, label) values
  ('bills.mark_paid',               'bills',            'Mark bills and POs as paid'),
  ('bills.approve',                 'bills',            'Approve bills'),
  ('purchase_orders.approve_for_sub','purchase_orders', 'Approve POs on behalf of a sub'),
  ('change_orders.approve_for_client','change_orders',  'Approve change orders on behalf of a client'),
  ('selections.approve_for_client', 'selections',       'Approve selections on behalf of a client'),
  ('time_clock.view_others',        'time_clock',       'View other users'' time sheets'),
  ('time_clock.adjust_others',      'time_clock',       'Adjust other users'' time sheets'),
  ('time_clock.approve',            'time_clock',       'Review and approve shifts'),
  ('leads.convert',                 'leads',            'Convert leads to jobs'),
  ('users.manage',                  'internal_users',   'Add, edit and deactivate internal users and roles'),
  ('settings.manage',               'company_settings', 'Manage company settings'),
  ('subscription.manage',           'company_settings', 'Manage subscription and billing'),
  ('audit.view',                    'company_settings', 'View the audit log');

-- ---------------------------------------------------------------------
-- Roles
--   org_id null + is_template = the 13 read-only templates.
--   Every builder org gets its own copy (is_builtin = true, locked).
--   Custom roles are clones with is_builtin = false.
-- ---------------------------------------------------------------------
create table public.roles (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid references public.organizations (id) on delete cascade,
  template_key          text,
  name                  text not null,
  description           text not null default '',
  is_template           boolean not null default false,
  is_builtin            boolean not null default false,
  allowed_job_statuses  public.job_status[] not null default '{presale,open,warranty,closed}',
  all_jobs_default      boolean not null default false,  -- new members get access to every job
  sort                  int not null default 100,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint roles_template_has_no_org check ((is_template and org_id is null) or (not is_template and org_id is not null))
);
create unique index roles_org_name_key on public.roles (org_id, lower(name)) where org_id is not null;
create unique index roles_template_key on public.roles (template_key) where is_template;
create trigger roles_touch before update on public.roles
  for each row execute function private.touch_updated_at();

create table public.role_permissions (
  role_id     uuid not null references public.roles (id) on delete cascade,
  module      text not null references public.app_modules (key),
  can_view    boolean not null default false,
  can_add     boolean not null default false,
  can_edit    boolean not null default false,
  can_delete  boolean not null default false,
  scope       public.perm_scope not null default 'assigned',
  see_cost    boolean not null default false,
  see_price   boolean not null default false,
  primary key (role_id, module),
  constraint role_permissions_view_needed check (can_view or not (can_add or can_edit or can_delete))
);

create table public.role_actions (
  role_id  uuid not null references public.roles (id) on delete cascade,
  action   text not null references public.app_actions (key),
  primary key (role_id, action)
);

-- ---------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------
create table public.org_members (
  org_id          uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role_id         uuid references public.roles (id) on delete restrict,   -- required for builder orgs
  is_admin        boolean not null default false,                         -- sub orgs: can edit company profile
  status          public.member_status not null default 'active',
  all_jobs        boolean not null default false,
  title           text,
  labor_cost_rate numeric(12,2),
  billable_rate   numeric(12,2),
  joined_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members (user_id);
create trigger org_members_touch before update on public.org_members
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Builder <-> sub links, with the sub's per-builder company profile
-- ---------------------------------------------------------------------
create table public.builder_sub_links (
  id                    uuid primary key default gen_random_uuid(),
  builder_org_id        uuid not null references public.organizations (id) on delete cascade,
  sub_org_id            uuid not null references public.organizations (id) on delete cascade,
  status                public.link_status not null default 'active',
  trade                 text,
  -- per-builder profile (the sub can hold a different profile per builder)
  company_name          text not null,
  primary_contact_first text,
  primary_contact_last  text,
  business_phone        text,
  fax                   text,
  cell_phone            text,
  sms_opt_in            boolean not null default false,
  primary_email         extensions.citext,
  street                text,
  city                  text,
  province              text,
  postal_code           text,
  custom                jsonb not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (builder_org_id, sub_org_id),
  check (builder_org_id <> sub_org_id)
);
create index builder_sub_links_sub_idx on public.builder_sub_links (sub_org_id);
create trigger builder_sub_links_touch before update on public.builder_sub_links
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------
create table public.job_groups (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references public.organizations (id) on delete cascade,
  name    text not null,
  unique (org_id, name)
);

create table public.jobs (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  title             text not null check (length(trim(title)) > 0),
  prefix            text,
  job_type          text,
  contract_type     public.contract_type not null default 'fixed_price',
  status            public.job_status not null default 'open',
  color             text not null default '#4F7CAC',
  street            text,
  city              text,
  province          text,
  postal_code       text,
  lat               double precision,
  lng               double precision,
  permit_number     text,
  lot_info          text,
  square_feet       int,
  work_days         smallint[] not null default '{1,2,3,4,5}',   -- 0 = Sunday
  projected_start   date,
  projected_end     date,
  actual_start      date,
  actual_end        date,
  sub_notes         text,            -- visible to subs on the job
  custom            jsonb not null default '{}',
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  check (projected_end is null or projected_start is null or projected_end >= projected_start)
);
create index jobs_org_idx on public.jobs (org_id) where deleted_at is null;
create trigger jobs_touch before update on public.jobs
  for each row execute function private.touch_updated_at();

-- Internal-only job fields, split out so subs and clients can never read them
create table public.job_private (
  job_id          uuid primary key references public.jobs (id) on delete cascade,
  contract_price  numeric(14,2),
  internal_notes  text,
  updated_at      timestamptz not null default now()
);
create trigger job_private_touch before update on public.job_private
  for each row execute function private.touch_updated_at();

create table public.job_group_members (
  job_id    uuid not null references public.jobs (id) on delete cascade,
  group_id  uuid not null references public.job_groups (id) on delete cascade,
  primary key (job_id, group_id)
);

create table public.job_managers (
  job_id   uuid not null references public.jobs (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  primary key (job_id, user_id)
);

-- Internal users with access to a job (when their membership is not all_jobs)
create table public.job_members (
  job_id   uuid not null references public.jobs (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (job_id, user_id)
);
create index job_members_user_idx on public.job_members (user_id);

-- Subs on a job, with the per-job permission wizard extras
create table public.job_subs (
  job_id                   uuid not null references public.jobs (id) on delete cascade,
  sub_org_id               uuid not null references public.organizations (id) on delete cascade,
  can_view_owner_info      boolean not null default false,
  can_share_with_client    boolean not null default false,
  can_assign_rfis_to_subs  boolean not null default false,
  see_all_schedule_items   boolean not null default false,
  added_at                 timestamptz not null default now(),
  primary key (job_id, sub_org_id)
);
create index job_subs_sub_idx on public.job_subs (sub_org_id);

-- Client (homeowner) contacts on a job
create table public.job_clients (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,   -- set once the invite is accepted
  first_name  text not null default '',
  last_name   text not null default '',
  email       extensions.citext,
  phone       text,
  is_primary  boolean not null default false,
  invited_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index job_clients_job_idx on public.job_clients (job_id);
create index job_clients_user_idx on public.job_clients (user_id);

-- What clients may see: company defaults + per-job override
create table public.client_permission_defaults (
  org_id    uuid primary key references public.organizations (id) on delete cascade,
  settings  jsonb not null default '{
    "schedule": "phases", "schedule_days_ahead": 30,
    "submit_change_orders": false, "submit_warranty_claims": true,
    "see_locked_selections": true, "job_price_summary": false,
    "invoices": true, "purchase_orders": false, "budget": false,
    "pm_contact": true
  }'
);

create table public.job_client_permissions (
  job_id    uuid primary key references public.jobs (id) on delete cascade,
  settings  jsonb not null
);

-- ---------------------------------------------------------------------
-- Cost codes
-- ---------------------------------------------------------------------
create table public.cost_categories (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references public.organizations (id) on delete cascade,
  name    text not null,
  sort    int not null default 100,
  unique (org_id, name)
);

create table public.cost_codes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  category_id     uuid not null references public.cost_categories (id) on delete restrict,
  parent_id       uuid references public.cost_codes (id) on delete restrict,
  code            text not null,
  title           text not null,
  description     text,
  internal_notes  text,
  is_active       boolean not null default true,
  is_labor        boolean not null default false,
  sort            int not null default 100,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, code)
);
create trigger cost_codes_touch before update on public.cost_codes
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Custom fields, tags, saved views
-- ---------------------------------------------------------------------
create table public.custom_field_defs (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  module              text not null references public.app_modules (key),
  key                 text not null check (key ~ '^[a-z][a-z0-9_]{0,40}$'),
  label               text not null,
  data_type           public.field_type not null,
  options             jsonb not null default '[]',
  tooltip             text,
  is_required         boolean not null default false,
  is_filterable       boolean not null default true,
  visible_to_subs     boolean not null default false,
  visible_to_clients  boolean not null default false,
  is_active           boolean not null default true,
  sort                int not null default 100,
  created_at          timestamptz not null default now(),
  unique (org_id, module, key)
);

create table public.tags (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references public.organizations (id) on delete cascade,
  module  text not null references public.app_modules (key),
  name    text not null,
  color   text,
  unique (org_id, module, name)
);

create table public.saved_views (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  module      text not null references public.app_modules (key),
  name        text not null,
  is_shared   boolean not null default false,
  is_default  boolean not null default false,
  config      jsonb not null default '{}',   -- columns, widths, sort, filters
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index saved_views_lookup on public.saved_views (org_id, module);
create trigger saved_views_touch before update on public.saved_views
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Per-user state: active org and selected jobs (persisted server side)
-- ---------------------------------------------------------------------
create table public.user_state (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  active_org_id  uuid references public.organizations (id) on delete set null,
  updated_at     timestamptz not null default now()
);

create table public.user_job_selection (
  user_id    uuid not null references auth.users (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  all_jobs   boolean not null default false,
  job_ids    uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

-- ---------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------
create table public.invites (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  kind          public.invite_kind not null,
  email         extensions.citext not null,
  role_id       uuid references public.roles (id) on delete cascade,        -- internal
  sub_org_id    uuid references public.organizations (id) on delete cascade, -- sub: join this sub org
  job_client_id uuid references public.job_clients (id) on delete cascade,  -- client
  token         text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by    uuid references auth.users (id) on delete set null,
  expires_at    timestamptz not null default now() + interval '14 days',
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index invites_org_idx on public.invites (org_id);

-- ---------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  org_id      uuid,
  actor_id    uuid,
  table_name  text not null,
  record_id   text not null,
  action      text not null check (action in ('insert', 'update', 'delete')),
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);
create index audit_log_org_at on public.audit_log (org_id, at desc);
create index audit_log_record on public.audit_log (table_name, record_id);

create or replace function private.audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org  uuid;
  v_id   text;
  v_row  jsonb;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org := coalesce((v_row ->> 'org_id')::uuid, (v_row ->> 'builder_org_id')::uuid);
  v_id  := coalesce(v_row ->> 'id', v_row ->> 'job_id', v_row ->> 'role_id', '');
  if v_org is null and v_row ? 'job_id' then
    select j.org_id into v_org from public.jobs j where j.id = (v_row ->> 'job_id')::uuid;
  end if;
  insert into public.audit_log (org_id, actor_id, table_name, record_id, action, before, after)
  values (
    v_org, auth.uid(), tg_table_name, v_id, lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

create trigger audit_jobs            after insert or update or delete on public.jobs            for each row execute function private.audit();
create trigger audit_job_private     after insert or update or delete on public.job_private     for each row execute function private.audit();
create trigger audit_org_members     after insert or update or delete on public.org_members     for each row execute function private.audit();
create trigger audit_roles           after insert or update or delete on public.roles           for each row execute function private.audit();
create trigger audit_builder_subs    after insert or update or delete on public.builder_sub_links for each row execute function private.audit();
create trigger audit_cost_codes      after insert or update or delete on public.cost_codes      for each row execute function private.audit();
create trigger audit_job_subs        after insert or update or delete on public.job_subs        for each row execute function private.audit();
create trigger audit_job_clients     after insert or update or delete on public.job_clients     for each row execute function private.audit();
