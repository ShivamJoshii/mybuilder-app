-- =====================================================================
-- Sales / CRM: leads, activities, configurable statuses and lists,
-- public web lead forms, convert-to-job.
-- =====================================================================

create type public.lead_status_category as enum ('open', 'won', 'lost', 'inactive');
create type public.activity_type as enum ('call', 'email', 'meeting', 'follow_up', 'website_form', 'note', 'sms');

create table public.lead_statuses (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations (id) on delete cascade,
  name      text not null check (length(trim(name)) between 1 and 40),
  category  public.lead_status_category not null,
  color     text not null default '#64748b',
  sort      int not null default 100,
  is_system boolean not null default false,       -- Sold / Lost are locked (category)
  unique (org_id, name)
);

create table public.lead_sources   (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations (id) on delete cascade, name text not null, sort int not null default 100, unique (org_id, name));
create table public.project_types  (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations (id) on delete cascade, name text not null, sort int not null default 100, unique (org_id, name));
create table public.lost_reasons   (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations (id) on delete cascade, name text not null, sort int not null default 100, unique (org_id, name));

create table public.leads (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  title                text not null check (length(trim(title)) between 1 and 120),
  status_id            uuid not null references public.lead_statuses (id) on delete restrict,
  contact_first        text not null default '',
  contact_last         text not null default '',
  contact_email        extensions.citext,
  contact_phone        text,
  site_street          text,
  site_city            text,
  site_province        text,
  site_postal          text,
  confidence           int check (confidence between 0 and 100),
  est_revenue_min      numeric(14,2) check (est_revenue_min >= 0),
  est_revenue_max      numeric(14,2) check (est_revenue_max >= 0),
  projected_sale_date  date,
  source_ids           uuid[] not null default '{}',
  project_type_ids     uuid[] not null default '{}',
  tag_ids              uuid[] not null default '{}',
  notes                text check (length(notes) <= 8000),
  custom               jsonb not null default '{}',
  status_changed_at    timestamptz not null default now(),
  sold_at              timestamptz,
  sold_amount          numeric(14,2),
  converted_job_id     uuid references public.jobs (id) on delete set null,
  lost_at              timestamptz,
  lost_reason_id       uuid references public.lost_reasons (id) on delete set null,
  lost_notes           text,
  created_by           uuid references public.profiles (id) on delete set null,   -- null when from a web form
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  check (est_revenue_max is null or est_revenue_min is null or est_revenue_max >= est_revenue_min)
);
create index leads_org_idx on public.leads (org_id, status_id) where deleted_at is null;
create trigger leads_touch before update on public.leads for each row execute function private.touch_updated_at();

create table public.lead_salespeople (
  lead_id  uuid not null references public.leads (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (lead_id, user_id)
);
create index lead_salespeople_user on public.lead_salespeople (user_id);

create table public.lead_activities (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  lead_id          uuid not null references public.leads (id) on delete cascade,
  type             public.activity_type not null,
  title            text check (length(title) <= 120),
  activity_date    date not null default current_date,
  start_time       time,
  end_time         time,
  reminder_minutes int,
  assigned_to      uuid references public.profiles (id) on delete set null,
  attendees        text,
  initiated_by     text not null default 'us' check (initiated_by in ('us', 'lead')),
  location         text,
  description      text check (length(description) <= 8000),
  completed_at     timestamptz,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index lead_activities_lead on public.lead_activities (lead_id, activity_date desc);
create index lead_activities_assignee on public.lead_activities (assigned_to, activity_date) where completed_at is null;

create table public.lead_forms (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  name               text not null,
  token              text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  default_source_id  uuid references public.lead_sources (id) on delete set null,
  thank_you          text not null default 'Thanks! We’ll be in touch shortly.',
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create or replace function private.fill_org_from_lead()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select org_id into new.org_id from public.leads where id = new.lead_id;
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  return new;
end $$;
create trigger lead_activities_fill before insert on public.lead_activities for each row execute function private.fill_org_from_lead();

-- Seed defaults for a builder org
create or replace function private.install_lead_defaults(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lead_statuses (org_id, name, category, color, sort, is_system) values
    (p_org, 'New', 'open', '#2563eb', 10, false), (p_org, 'Contacted', 'open', '#0891b2', 20, false),
    (p_org, 'Qualified', 'open', '#7c3aed', 30, false), (p_org, 'Proposal sent', 'open', '#d97706', 40, false),
    (p_org, 'On hold', 'open', '#64748b', 50, false), (p_org, 'Sold', 'won', '#16a34a', 60, true),
    (p_org, 'Lost', 'lost', '#dc2626', 70, true), (p_org, 'No opportunity', 'inactive', '#94a3b8', 80, false)
  on conflict do nothing;
  insert into public.lead_sources (org_id, name, sort) values
    (p_org, 'Website form', 10), (p_org, 'Referral', 20), (p_org, 'Google', 30), (p_org, 'Facebook', 40),
    (p_org, 'Repeat client', 50), (p_org, 'Show home', 60), (p_org, 'Home show', 70), (p_org, 'Other', 80)
  on conflict do nothing;
  insert into public.project_types (org_id, name, sort) values
    (p_org, 'Single-family', 10), (p_org, 'Custom home', 20), (p_org, 'Duplex', 30), (p_org, 'Townhome', 40),
    (p_org, 'Renovation', 50), (p_org, 'Basement', 60), (p_org, 'Other', 70)
  on conflict do nothing;
  insert into public.lost_reasons (org_id, name, sort) values
    (p_org, 'Price', 10), (p_org, 'Went with a competitor', 20), (p_org, 'Timing', 30), (p_org, 'No response', 40),
    (p_org, 'Out of scope', 50), (p_org, 'Financing', 60)
  on conflict do nothing;
end $$;
revoke execute on function private.install_lead_defaults(uuid) from authenticated;

-- Existing orgs get defaults too
do $$ declare o record; begin
  for o in select id from public.organizations where kind = 'builder' loop perform private.install_lead_defaults(o.id); end loop;
end $$;

-- New builder orgs get them via create_builder_org
create or replace function private.after_builder_org()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'builder' then perform private.install_lead_defaults(new.id); end if;
  return null;
end $$;
create trigger organizations_lead_defaults after insert on public.organizations for each row execute function private.after_builder_org();

-- Keep status bookkeeping in sync
create or replace function private.lead_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cat public.lead_status_category;
begin
  if not exists (select 1 from public.lead_statuses where id = new.status_id and org_id = new.org_id) then
    raise exception 'Status does not belong to this company' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
    select category into v_cat from public.lead_statuses where id = new.status_id;
    new.status_changed_at := now();
    new.sold_at := case when v_cat = 'won' then coalesce(new.sold_at, now()) else null end;
    new.lost_at := case when v_cat = 'lost' then coalesce(new.lost_at, now()) else null end;
  end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  return new;
end $$;
create trigger leads_status before insert or update on public.leads for each row execute function private.lead_status_change();

-- Visibility: role scope 'own' limits to leads you created or are a salesperson on
create or replace function private.lead_visible(p_id uuid, p_org uuid, p_created_by uuid, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and private.has_perm(p_org, 'leads', 'view') and (
    private.perm_scope(p_org, 'leads') <> 'own'
    or p_created_by = auth.uid()
    or exists (select 1 from public.lead_salespeople s where s.lead_id = p_id and s.user_id = auth.uid()));
$$;
create or replace function private.can_see_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.lead_visible(l.id, l.org_id, l.created_by, l.deleted_at) from public.leads l where l.id = p_lead), false);
$$;
grant execute on function private.lead_visible(uuid, uuid, uuid, timestamptz), private.can_see_lead(uuid) to authenticated;

alter table public.lead_statuses enable row level security;
alter table public.lead_sources enable row level security;
alter table public.project_types enable row level security;
alter table public.lost_reasons enable row level security;
alter table public.leads enable row level security;
alter table public.lead_salespeople enable row level security;
alter table public.lead_activities enable row level security;
alter table public.lead_forms enable row level security;

do $$ declare t text; begin
  foreach t in array array['lead_statuses', 'lead_sources', 'project_types', 'lost_reasons'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (private.is_member(org_id))', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated using (private.has_action(org_id, ''settings.manage'')) with check (private.has_action(org_id, ''settings.manage''))', t);
  end loop;
end $$;
-- System statuses keep their category
create or replace function private.lock_system_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.is_system and (tg_op = 'DELETE' or new.category <> old.category) then
    raise exception 'Sold and Lost can be renamed but not removed' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger lead_statuses_lock before update or delete on public.lead_statuses for each row execute function private.lock_system_status();

create policy leads_select on public.leads for select to authenticated using (private.lead_visible(id, org_id, created_by, deleted_at));
create policy leads_insert on public.leads for insert to authenticated with check (private.has_perm(org_id, 'leads', 'add'));
create policy leads_update on public.leads for update to authenticated
  using (private.has_perm(org_id, 'leads', 'edit') and private.lead_visible(id, org_id, created_by, deleted_at))
  with check (private.has_perm(org_id, 'leads', 'edit'));

create policy lead_sp_select on public.lead_salespeople for select to authenticated using (private.can_see_lead(lead_id));
create policy lead_sp_write on public.lead_salespeople for all to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id and private.has_perm(l.org_id, 'leads', 'edit')))
  with check (exists (select 1 from public.leads l where l.id = lead_id and private.has_perm(l.org_id, 'leads', 'add')));

create policy lead_act_select on public.lead_activities for select to authenticated using (private.can_see_lead(lead_id));
create policy lead_act_write on public.lead_activities for all to authenticated
  using (private.can_see_lead(lead_id) and private.has_perm(org_id, 'leads', 'edit'))
  with check (private.can_see_lead(lead_id) and private.has_perm(org_id, 'leads', 'add'));

create policy lead_forms_select on public.lead_forms for select to authenticated using (private.is_member(org_id));
create policy lead_forms_write on public.lead_forms for all to authenticated
  using (private.has_action(org_id, 'settings.manage')) with check (private.has_action(org_id, 'settings.manage'));

insert into public.app_notification_types (key, grp, module, label, sort) values
  ('lead.new', 'Sales', 'Leads', 'New lead from your website', 1),
  ('lead.assigned', 'Sales', 'Leads', 'Lead assigned to you', 2);

create or replace function private.ntf_lead_salesperson()
returns trigger language plpgsql security definer set search_path = '' as $$
declare l public.leads;
begin
  select * into l from public.leads where id = new.lead_id;
  perform private.notify(array[new.user_id], l.org_id, null, 'lead.assigned', 'Lead assigned to you: ' || l.title, null, '/leads/' || l.id);
  return null;
end $$;
create trigger ntf_lead_salespeople after insert on public.lead_salespeople for each row execute function private.ntf_lead_salesperson();

-- Public web form submission (no login). Minimal fields, honeypot handled in the app.
create or replace function public.submit_lead_form(p_token text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare f public.lead_forms; v_status uuid; v_lead uuid; v_managers uuid[];
  v_first text := left(trim(coalesce(p_payload ->> 'first_name', '')), 80);
  v_last text := left(trim(coalesce(p_payload ->> 'last_name', '')), 80);
  v_email text := left(trim(coalesce(p_payload ->> 'email', '')), 200);
  v_phone text := left(trim(coalesce(p_payload ->> 'phone', '')), 40);
  v_msg text := left(trim(coalesce(p_payload ->> 'message', '')), 4000);
begin
  select * into f from public.lead_forms where token = p_token and is_active;
  if f.id is null then return false; end if;
  if v_first = '' or (v_email = '' and v_phone = '') then raise exception 'Name and email or phone are required' using errcode = '23514'; end if;
  if v_email <> '' and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Invalid email' using errcode = '23514'; end if;
  -- simple flood guard: max 20 submissions per form per hour
  if (select count(*) from public.leads l where l.org_id = f.org_id and l.created_by is null and l.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many submissions, try again later' using errcode = '54000';
  end if;
  select id into v_status from public.lead_statuses where org_id = f.org_id and category = 'open' order by sort limit 1;
  insert into public.leads (org_id, title, status_id, contact_first, contact_last, contact_email, contact_phone,
                            site_street, site_city, site_postal, notes, source_ids, created_by)
  values (f.org_id, left(trim(v_first || ' ' || v_last), 120), v_status, v_first, v_last, nullif(v_email, ''), nullif(v_phone, ''),
          left(p_payload ->> 'street', 200), left(p_payload ->> 'city', 100), left(p_payload ->> 'postal_code', 10), nullif(v_msg, ''),
          case when f.default_source_id is null then '{}' else array[f.default_source_id] end, null)
  returning id into v_lead;
  insert into public.lead_activities (org_id, lead_id, type, title, initiated_by, description, completed_at)
  values (f.org_id, v_lead, 'website_form', 'Website form: ' || f.name, 'lead', nullif(v_msg, ''), now());
  select coalesce(array_agg(m.user_id), '{}') into v_managers from public.org_members m
    join public.role_permissions rp on rp.role_id = m.role_id and rp.module = 'leads' and rp.can_view and rp.scope = 'all'
    where m.org_id = f.org_id and m.status = 'active';
  perform private.notify(v_managers, f.org_id, null, 'lead.new', 'New lead: ' || trim(v_first || ' ' || v_last), v_msg, '/leads/' || v_lead);
  return true;
end $$;
revoke execute on function public.submit_lead_form(text, jsonb) from public;
grant execute on function public.submit_lead_form(text, jsonb) to anon, authenticated;

create or replace function public.lead_form_info(p_token text)
returns table (org_name text, form_name text, thank_you text) language sql stable security definer set search_path = '' as $$
  select o.name, f.name, f.thank_you from public.lead_forms f join public.organizations o on o.id = f.org_id where f.token = p_token and f.is_active;
$$;
revoke execute on function public.lead_form_info(text) from public;
grant execute on function public.lead_form_info(text) to anon, authenticated;

-- Convert a lead into a job (runs as the caller: needs leads.convert + jobs.add)
create or replace function public.convert_lead_to_job(p_lead uuid, p_title text, p_contract public.contract_type default 'fixed_price', p_amount numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.leads; v_job uuid; v_sold uuid;
begin
  select * into l from public.leads where id = p_lead and deleted_at is null;
  if l.id is null or not private.can_see_lead(p_lead) then raise exception 'Lead not found' using errcode = 'P0002'; end if;
  if not private.has_action(l.org_id, 'leads.convert') then raise exception 'Not allowed to convert leads' using errcode = '42501'; end if;
  if l.converted_job_id is not null then raise exception 'Already converted' using errcode = '23505'; end if;
  insert into public.jobs (org_id, title, status, contract_type, street, city, province, postal_code)
  values (l.org_id, coalesce(nullif(trim(p_title), ''), l.title), 'presale', p_contract, l.site_street, l.site_city, coalesce(l.site_province, 'AB'), l.site_postal)
  returning id into v_job;
  if p_amount is not null then update public.job_private set contract_price = p_amount where job_id = v_job; end if;
  if l.contact_first <> '' or l.contact_email is not null then
    insert into public.job_clients (job_id, first_name, last_name, email, phone, is_primary)
    values (v_job, l.contact_first, l.contact_last, l.contact_email, l.contact_phone, true);
  end if;
  select id into v_sold from public.lead_statuses where org_id = l.org_id and category = 'won' order by sort limit 1;
  update public.leads set status_id = v_sold, converted_job_id = v_job, sold_amount = coalesce(p_amount, sold_amount) where id = p_lead;
  return v_job;
end $$;
revoke execute on function public.convert_lead_to_job(uuid, text, public.contract_type, numeric) from public, anon;
grant execute on function public.convert_lead_to_job(uuid, text, public.contract_type, numeric) to authenticated;

create trigger audit_leads after insert or update or delete on public.leads for each row execute function private.audit();
revoke all on public.leads, public.lead_statuses, public.lead_sources, public.project_types, public.lost_reasons,
  public.lead_salespeople, public.lead_activities, public.lead_forms from anon;
