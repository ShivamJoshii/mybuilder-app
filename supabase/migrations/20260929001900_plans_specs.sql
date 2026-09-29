-- =====================================================================
-- Plans (sheets with versions and markups) and specifications.
-- A plan set PDF is split into one sheet per page; each sheet version
-- points at a stored file and a page number. Markups are vector shapes
-- in PDF page units, so they stay put at any zoom.
-- =====================================================================

create table public.plan_sheets (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  job_id           uuid not null references public.jobs (id) on delete cascade,
  number           text not null check (length(trim(number)) between 1 and 30),
  title            text not null default '' check (length(title) <= 200),
  discipline       text check (length(discipline) <= 40),
  current_version  int not null default 1,
  share_subs       boolean not null default false,
  share_clients    boolean not null default false,
  created_by       uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index plan_sheets_job on public.plan_sheets (job_id, number) where deleted_at is null;
create trigger plan_sheets_fill before insert on public.plan_sheets for each row execute function private.fill_org_from_job();

create table public.plan_sheet_versions (
  id           uuid primary key default gen_random_uuid(),
  sheet_id     uuid not null references public.plan_sheets (id) on delete cascade,
  version      int not null check (version >= 1),
  storage_key  text not null,
  mime         text not null default 'application/pdf',
  size_bytes   bigint not null default 0,
  page         int not null default 1 check (page >= 1),
  note         text check (length(note) <= 500),
  status       text not null default 'pending' check (status in ('pending', 'ready')),
  uploaded_by  uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  unique (sheet_id, version)
);

create type public.markup_visibility as enum ('private', 'team', 'shared');
create table public.plan_markups (
  id          uuid primary key default gen_random_uuid(),
  sheet_id    uuid not null references public.plan_sheets (id) on delete cascade,
  version     int not null,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  visibility  public.markup_visibility not null default 'team',
  shapes      jsonb not null default '[]' check (jsonb_typeof(shapes) = 'array' and pg_column_size(shapes) < 2000000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (sheet_id, version, author_id)
);
create trigger plan_markups_touch before update on public.plan_markups for each row execute function private.touch_updated_at();

create table public.spec_documents (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  job_id         uuid not null references public.jobs (id) on delete cascade,
  division       text check (length(division) <= 80),
  title          text not null check (length(trim(title)) between 1 and 200),
  body           text not null default '' check (length(body) <= 100000),
  share_subs     boolean not null default false,
  share_clients  boolean not null default false,
  created_by     uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index spec_documents_job on public.spec_documents (job_id) where deleted_at is null;
create trigger spec_documents_fill before insert on public.spec_documents for each row execute function private.fill_org_from_job();
create trigger spec_documents_touch before update on public.spec_documents for each row execute function private.touch_updated_at();

-- Visibility shared by sheets and specs
create or replace function private.plan_visible(p_job uuid, p_subs boolean, p_clients boolean, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_module(p_job, 'specs', 'view')
      or (p_deleted is null and ((p_subs and private.is_job_sub(p_job)) or (p_clients and private.is_job_client(p_job))));
$$;
create or replace function public.can_see_sheet(p_sheet uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plan_sheets s where s.id = p_sheet and private.plan_visible(s.job_id, s.share_subs, s.share_clients, s.deleted_at));
$$;
create or replace function private.sheet_job(p_sheet uuid)
returns uuid language sql stable security definer set search_path = '' as $$ select job_id from public.plan_sheets where id = p_sheet $$;
grant execute on function private.plan_visible(uuid, boolean, boolean, timestamptz), private.sheet_job(uuid) to authenticated;
revoke execute on function public.can_see_sheet(uuid) from public, anon;
grant execute on function public.can_see_sheet(uuid) to authenticated;

-- Markup visibility: private = author only; team = internal users; shared = anyone who sees the sheet
create or replace function private.markup_visible(p_sheet uuid, p_author uuid, p_vis public.markup_visibility)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_author = auth.uid()
      or (p_vis = 'team' and private.can_module(private.sheet_job(p_sheet), 'specs', 'view'))
      or (p_vis = 'shared' and public.can_see_sheet(p_sheet));
$$;
grant execute on function private.markup_visible(uuid, uuid, public.markup_visibility) to authenticated;

insert into public.app_notification_types (key, grp, module, label, sort) values
  ('plans.published', 'Project Management', 'Plans and specs', 'New plans or specs shared with you', 40);

-- Tell subs/clients when a sheet is newly shared with them or gets a new version
create or replace function private.ntf_plan_shared()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_users uuid[] := '{}';
begin
  if new.deleted_at is not null then return null; end if;
  if new.share_subs and (tg_op = 'INSERT' or not old.share_subs or new.current_version > old.current_version) then
    select coalesce(array_agg(distinct m.user_id), '{}') into v_users
    from public.job_subs js join public.org_members m on m.org_id = js.sub_org_id and m.status = 'active' where js.job_id = new.job_id;
  end if;
  if new.share_clients and (tg_op = 'INSERT' or not old.share_clients or new.current_version > old.current_version) then
    v_users := v_users || (select coalesce(array_agg(user_id), '{}') from public.job_clients where job_id = new.job_id and user_id is not null);
  end if;
  if cardinality(v_users) > 0 then
    perform private.notify(v_users, new.org_id, new.job_id, 'plans.published',
      'Plan sheet ' || new.number || case when new.current_version > 1 then ' updated to version ' || new.current_version else ' shared' end, new.title, '/plans/' || new.id);
  end if;
  return null;
end $$;
create trigger plan_sheets_ntf after update of share_subs, share_clients, current_version on public.plan_sheets for each row execute function private.ntf_plan_shared();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.plan_sheets enable row level security;
alter table public.plan_sheet_versions enable row level security;
alter table public.plan_markups enable row level security;
alter table public.spec_documents enable row level security;

create policy sheets_select on public.plan_sheets for select to authenticated using (private.plan_visible(job_id, share_subs, share_clients, deleted_at));
create policy sheets_insert on public.plan_sheets for insert to authenticated with check (private.can_module(job_id, 'specs', 'add'));
create policy sheets_update on public.plan_sheets for update to authenticated using (private.can_module(job_id, 'specs', 'edit')) with check (private.can_module(job_id, 'specs', 'edit'));

create policy sheet_versions_select on public.plan_sheet_versions for select to authenticated using (public.can_see_sheet(sheet_id));
create policy sheet_versions_insert on public.plan_sheet_versions for insert to authenticated
  with check (private.can_module(private.sheet_job(sheet_id), 'specs', 'add') or private.can_module(private.sheet_job(sheet_id), 'specs', 'edit'));
create policy sheet_versions_update on public.plan_sheet_versions for update to authenticated
  using (uploaded_by = (select auth.uid()) and status = 'pending') with check (uploaded_by = (select auth.uid()));

create policy markups_select on public.plan_markups for select to authenticated using (private.markup_visible(sheet_id, author_id, visibility));
create policy markups_insert on public.plan_markups for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_see_sheet(sheet_id)
              and (visibility <> 'team' or private.can_module(private.sheet_job(sheet_id), 'specs', 'view')));
create policy markups_update on public.plan_markups for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()) and public.can_see_sheet(sheet_id));
create policy markups_delete on public.plan_markups for delete to authenticated using (author_id = (select auth.uid()));

create policy specs_select on public.spec_documents for select to authenticated using (private.plan_visible(job_id, share_subs, share_clients, deleted_at));
create policy specs_insert on public.spec_documents for insert to authenticated with check (private.can_module(job_id, 'specs', 'add'));
create policy specs_update on public.spec_documents for update to authenticated using (private.can_module(job_id, 'specs', 'edit')) with check (private.can_module(job_id, 'specs', 'edit'));

revoke all on public.plan_sheets, public.plan_sheet_versions, public.plan_markups, public.spec_documents from anon;
