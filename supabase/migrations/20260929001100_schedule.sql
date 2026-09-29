-- =====================================================================
-- Schedule: items, phases, assignees + confirmations, dependencies,
-- workday exceptions, online/offline per job, shift history, baselines.
-- Date math (durations, cascades) runs in the app (src/lib/schedule).
-- =====================================================================

create type public.dep_type as enum ('FS', 'SS');
create type public.confirm_status as enum ('pending', 'confirmed', 'declined');
create type public.workday_exception_type as enum ('non_workday', 'extra_workday');

create table public.job_schedule_settings (
  job_id      uuid primary key references public.jobs (id) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  is_online   boolean not null default false,
  online_at   timestamptz,
  updated_at  timestamptz not null default now()
);

create table public.schedule_phases (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references public.organizations (id) on delete cascade,
  job_id  uuid not null references public.jobs (id) on delete cascade,
  name    text not null check (length(trim(name)) between 1 and 80),
  color   text not null default '#64748b',
  sort    int not null default 0,
  unique (job_id, name)
);

create table public.schedule_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  job_id          uuid not null references public.jobs (id) on delete cascade,
  phase_id        uuid references public.schedule_phases (id) on delete set null,
  title           text not null check (length(trim(title)) between 1 and 120),
  color           text,
  start_date      date not null,
  duration        int not null default 1 check (duration between 1 and 2000),
  end_date        date not null,
  is_hourly       boolean not null default false,
  start_time      time,
  end_time        time,
  progress        int not null default 0 check (progress between 0 and 100),
  completed_at    timestamptz,
  show_on_gantt   boolean not null default true,
  show_subs       boolean not null default false,   -- visible to subs on the job who are not assigned
  show_client     boolean not null default false,
  notes_all       text check (length(notes_all) <= 4000),
  reminder_days   int check (reminder_days is null or reminder_days between 0 and 60),
  created_by      uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  check (end_date >= start_date)
);
create index schedule_items_job_idx on public.schedule_items (job_id, start_date) where deleted_at is null;
create trigger schedule_items_touch before update on public.schedule_items for each row execute function private.touch_updated_at();

create table public.schedule_assignees (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.schedule_items (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete cascade,
  sub_org_id   uuid references public.organizations (id) on delete cascade,
  status       public.confirm_status not null default 'pending',
  responded_at timestamptz,
  responded_by uuid references public.profiles (id) on delete set null,
  check ((user_id is null) <> (sub_org_id is null))
);
create unique index schedule_assignees_user on public.schedule_assignees (item_id, user_id) where user_id is not null;
create unique index schedule_assignees_sub on public.schedule_assignees (item_id, sub_org_id) where sub_org_id is not null;
create index schedule_assignees_sub_idx on public.schedule_assignees (sub_org_id);

create table public.schedule_links (
  predecessor_id  uuid not null references public.schedule_items (id) on delete cascade,
  successor_id    uuid not null references public.schedule_items (id) on delete cascade,
  type            public.dep_type not null default 'FS',
  lag_days        int not null default 0 check (lag_days between -365 and 365),
  primary key (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);
create index schedule_links_succ on public.schedule_links (successor_id);

create table public.workday_exceptions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  job_id           uuid references public.jobs (id) on delete cascade,     -- null = all jobs
  type             public.workday_exception_type not null,
  title            text not null check (length(trim(title)) between 1 and 80),
  category         text,
  start_date       date not null,
  end_date         date not null,
  repeat_annually  boolean not null default false,
  created_at       timestamptz not null default now(),
  check (end_date >= start_date)
);
create index workday_exceptions_org on public.workday_exceptions (org_id);

create table public.schedule_shifts (
  id          bigint generated always as identity primary key,
  item_id     uuid not null references public.schedule_items (id) on delete cascade,
  old_start   date not null,
  old_end     date not null,
  new_start   date not null,
  new_end     date not null,
  reason      text,
  notes       text,
  cascaded    boolean not null default false,
  shifted_by  uuid references public.profiles (id) on delete set null,
  shifted_at  timestamptz not null default now()
);
create index schedule_shifts_item on public.schedule_shifts (item_id, shifted_at desc);

create table public.schedule_baselines (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  captured_at  timestamptz not null default now(),
  captured_by  uuid references public.profiles (id) on delete set null,
  items        jsonb not null        -- [{id, title, start_date, end_date, duration}]
);

-- Fill org from job on every schedule table that has one
create or replace function private.fill_org_from_job()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select org_id into new.org_id from public.jobs where id = new.job_id;
  return new;
end $$;
create trigger job_schedule_settings_fill before insert or update on public.job_schedule_settings for each row execute function private.fill_org_from_job();
create trigger schedule_phases_fill before insert on public.schedule_phases for each row execute function private.fill_org_from_job();
create trigger schedule_items_fill before insert on public.schedule_items for each row execute function private.fill_org_from_job();

-- Log date shifts while the job's schedule is online
create or replace function private.log_schedule_shift()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.start_date, old.end_date) is distinct from (new.start_date, new.end_date)
     and exists (select 1 from public.job_schedule_settings s where s.job_id = new.job_id and s.is_online) then
    insert into public.schedule_shifts (item_id, old_start, old_end, new_start, new_end, reason, notes, cascaded, shifted_by)
    values (new.id, old.start_date, old.end_date, new.start_date, new.end_date,
            nullif(current_setting('app.shift_reason', true), ''), nullif(current_setting('app.shift_notes', true), ''),
            coalesce(current_setting('app.shift_cascaded', true) = 'on', false), auth.uid());
    -- assignees must re-confirm moved items
    update public.schedule_assignees set status = 'pending', responded_at = null, responded_by = null
    where item_id = new.id and sub_org_id is not null;
  end if;
  return null;
end $$;
create trigger schedule_items_shift after update on public.schedule_items for each row execute function private.log_schedule_shift();

create or replace function private.schedule_online(p_job uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_online from public.job_schedule_settings where job_id = p_job), false);
$$;

-- Assigned to the caller directly or through their sub company
create or replace function private.is_schedule_assignee(p_item uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.schedule_assignees a
    where a.item_id = p_item and (a.user_id = auth.uid()
      or exists (select 1 from public.org_members m where m.org_id = a.sub_org_id and m.user_id = auth.uid() and m.status = 'active')));
$$;

create or replace function private.schedule_item_visible(p_id uuid, p_job uuid, p_show_subs boolean, p_show_client boolean, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and (
    private.can_module(p_job, 'schedule', 'view')
    or (private.schedule_online(p_job) and private.is_job_sub(p_job) and (
          private.is_schedule_assignee(p_id)
          or (p_show_subs and exists (
                select 1 from public.job_subs js join public.org_members m on m.org_id = js.sub_org_id
                where js.job_id = p_job and js.see_all_schedule_items and m.user_id = auth.uid() and m.status = 'active'))))
    or (private.schedule_online(p_job) and p_show_client and private.is_job_client(p_job)));
$$;

create or replace function private.can_see_schedule_item(p_item uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.schedule_item_visible(i.id, i.job_id, i.show_subs, i.show_client, i.deleted_at)
                   from public.schedule_items i where i.id = p_item), false);
$$;
grant execute on function private.schedule_online(uuid), private.is_schedule_assignee(uuid),
  private.schedule_item_visible(uuid, uuid, boolean, boolean, timestamptz), private.can_see_schedule_item(uuid) to authenticated;

-- Subs confirm or decline their assigned items
create or replace function public.respond_schedule_item(p_item uuid, p_confirm boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if not private.can_see_schedule_item(p_item) then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.schedule_assignees a set status = case when p_confirm then 'confirmed'::public.confirm_status else 'declined' end,
         responded_at = now(), responded_by = auth.uid()
  where a.item_id = p_item and (a.user_id = auth.uid()
    or exists (select 1 from public.org_members m where m.org_id = a.sub_org_id and m.user_id = auth.uid() and m.status = 'active'));
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'You are not assigned to this item' using errcode = '42501'; end if;
end $$;
revoke execute on function public.respond_schedule_item(uuid, boolean) from public, anon;
grant execute on function public.respond_schedule_item(uuid, boolean) to authenticated;

-- RLS
alter table public.job_schedule_settings enable row level security;
alter table public.schedule_phases enable row level security;
alter table public.schedule_items enable row level security;
alter table public.schedule_assignees enable row level security;
alter table public.schedule_links enable row level security;
alter table public.workday_exceptions enable row level security;
alter table public.schedule_shifts enable row level security;
alter table public.schedule_baselines enable row level security;

create policy sched_settings_select on public.job_schedule_settings for select to authenticated using (private.can_see_job(job_id));
create policy sched_settings_write on public.job_schedule_settings for all to authenticated
  using (private.can_module(job_id, 'schedule', 'edit')) with check (private.can_module(job_id, 'schedule', 'edit'));

create policy phases_select on public.schedule_phases for select to authenticated using (private.can_see_job(job_id));
create policy phases_write on public.schedule_phases for all to authenticated
  using (private.can_module(job_id, 'schedule', 'edit')) with check (private.can_module(job_id, 'schedule', 'add'));

create policy items_select on public.schedule_items for select to authenticated
  using (private.schedule_item_visible(id, job_id, show_subs, show_client, deleted_at));
create policy items_insert on public.schedule_items for insert to authenticated
  with check (created_by = (select auth.uid()) and private.can_module(job_id, 'schedule', 'add'));
create policy items_update on public.schedule_items for update to authenticated
  using (private.can_module(job_id, 'schedule', 'edit')) with check (private.can_module(job_id, 'schedule', 'edit'));

-- Audience notes live in their own rows so each audience only ever reads its own
create table public.schedule_item_notes (
  item_id   uuid not null references public.schedule_items (id) on delete cascade,
  audience  text not null check (audience in ('internal', 'sub', 'client')),
  body      text not null check (length(body) between 1 and 4000),
  primary key (item_id, audience)
);
alter table public.schedule_item_notes enable row level security;
create policy item_notes_select on public.schedule_item_notes for select to authenticated
  using (exists (select 1 from public.schedule_items i where i.id = item_id and (
           private.can_module(i.job_id, 'schedule', 'view')
        or (audience = 'sub' and private.is_job_sub(i.job_id) and private.can_see_schedule_item(i.id))
        or (audience = 'client' and private.is_job_client(i.job_id) and private.can_see_schedule_item(i.id)))));
create policy item_notes_write on public.schedule_item_notes for all to authenticated
  using (exists (select 1 from public.schedule_items i where i.id = item_id and private.can_module(i.job_id, 'schedule', 'edit')))
  with check (exists (select 1 from public.schedule_items i where i.id = item_id and (private.can_module(i.job_id, 'schedule', 'edit') or private.can_module(i.job_id, 'schedule', 'add'))));
revoke all on public.schedule_item_notes from anon;

create policy assignees_select on public.schedule_assignees for select to authenticated using (private.can_see_schedule_item(item_id));
create policy assignees_write on public.schedule_assignees for all to authenticated
  using (exists (select 1 from public.schedule_items i where i.id = item_id and private.can_module(i.job_id, 'schedule', 'edit')))
  with check (exists (select 1 from public.schedule_items i where i.id = item_id and (private.can_module(i.job_id, 'schedule', 'edit') or private.can_module(i.job_id, 'schedule', 'add'))));

create policy links_select on public.schedule_links for select to authenticated
  using (private.can_see_schedule_item(predecessor_id) and private.can_see_schedule_item(successor_id));
create policy links_write on public.schedule_links for all to authenticated
  using (exists (select 1 from public.schedule_items i where i.id = successor_id and private.can_module(i.job_id, 'schedule', 'edit')))
  with check (exists (select 1 from public.schedule_items i join public.schedule_items p on p.id = predecessor_id and p.job_id = i.job_id
                      where i.id = successor_id and private.can_module(i.job_id, 'schedule', 'edit')));

create policy exceptions_select on public.workday_exceptions for select to authenticated
  using (private.is_member(org_id) or private.is_linked_sub_of(org_id) or private.is_client_of(org_id));
create policy exceptions_write on public.workday_exceptions for all to authenticated
  using (private.has_perm(org_id, 'schedule', 'edit')) with check (private.has_perm(org_id, 'schedule', 'edit'));

create policy shifts_select on public.schedule_shifts for select to authenticated
  using (exists (select 1 from public.schedule_items i where i.id = item_id and private.can_module(i.job_id, 'schedule', 'view')));
create policy baselines_select on public.schedule_baselines for select to authenticated using (private.can_module(job_id, 'schedule', 'view'));
create policy baselines_insert on public.schedule_baselines for insert to authenticated with check (private.can_module(job_id, 'schedule', 'edit'));

-- Notify assignees when an item is assigned while online, and when the job goes online
create or replace function private.ntf_schedule_assigned()
returns trigger language plpgsql security definer set search_path = '' as $$
declare i public.schedule_items;
begin
  select * into i from public.schedule_items where id = new.item_id;
  if private.schedule_online(i.job_id) then
    perform private.notify(case when new.user_id is not null then array[new.user_id] else private.org_users(new.sub_org_id) end,
      i.org_id, i.job_id, 'schedule.assigned', 'Scheduled: ' || i.title || ' (' || to_char(i.start_date, 'Mon DD') || ')', null, '/schedule?item=' || i.id);
  end if;
  return null;
end $$;
create trigger ntf_schedule_assignees after insert on public.schedule_assignees for each row execute function private.ntf_schedule_assigned();

insert into public.app_notification_types (key, grp, module, label, sort) values
  ('schedule.assigned', 'Project Management', 'Schedule', 'Schedule item assigned to you', 15),
  ('schedule.changed',  'Project Management', 'Schedule', 'Your schedule item moved', 16);

create or replace function private.ntf_schedule_shift()
returns trigger language plpgsql security definer set search_path = '' as $$
declare i public.schedule_items; v_users uuid[];
begin
  select * into i from public.schedule_items where id = new.item_id;
  select coalesce(array_agg(distinct u), '{}') into v_users from (
    select a.user_id u from public.schedule_assignees a where a.item_id = i.id and a.user_id is not null
    union select m.user_id from public.schedule_assignees a join public.org_members m on m.org_id = a.sub_org_id and m.status = 'active' where a.item_id = i.id) s;
  perform private.notify(v_users, i.org_id, i.job_id, 'schedule.changed',
    i.title || ' moved to ' || to_char(new.new_start, 'Mon DD'), new.reason, '/schedule?item=' || i.id);
  return null;
end $$;
create trigger ntf_schedule_shifts after insert on public.schedule_shifts for each row execute function private.ntf_schedule_shift();

revoke all on public.job_schedule_settings, public.schedule_phases, public.schedule_items, public.schedule_assignees,
  public.schedule_links, public.workday_exceptions, public.schedule_shifts, public.schedule_baselines from anon;
