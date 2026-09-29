-- =====================================================================
-- Daily logs: what happened on site each day, with weather and sharing.
-- Builders and subs can both write logs. Drafts are private to the author.
-- =====================================================================

create type public.log_status as enum ('draft', 'published');

create table public.daily_logs (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations (id) on delete cascade,
  job_id                  uuid not null references public.jobs (id) on delete cascade,
  log_date                date not null default current_date,
  title                   text check (title is null or length(title) <= 50),
  notes                   text not null check (length(trim(notes)) between 1 and 4000),
  tag_ids                 uuid[] not null default '{}',
  weather                 jsonb,          -- {code, condition, high_c, low_c, wind_kmh, humidity_pct, precip_mm, fetched_at}
  include_weather         boolean not null default true,
  weather_notes           text check (weather_notes is null or length(weather_notes) <= 1000),
  include_weather_notes   boolean not null default false,
  share_internal          boolean not null default true,
  share_subs              boolean not null default false,
  share_clients           boolean not null default false,
  status                  public.log_status not null default 'draft',
  author_type             text not null default 'internal' check (author_type in ('internal', 'sub')),
  custom                  jsonb not null default '{}',
  created_by              uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  published_at            timestamptz,
  deleted_at              timestamptz,
  check (log_date <= current_date + 1)   -- no future logs (1 day slack for time zones)
);
create index daily_logs_job_date on public.daily_logs (job_id, log_date desc) where deleted_at is null;
create trigger daily_logs_touch before update on public.daily_logs for each row execute function private.touch_updated_at();

create or replace function private.daily_log_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select org_id into new.org_id from public.jobs where id = new.job_id;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.author_type := case when private.is_job_internal(new.job_id) then 'internal' else 'sub' end;
    if new.author_type = 'sub' then
      new.share_subs := true;          -- a sub's own log is visible to its company
    end if;
  else
    new.created_by := old.created_by; new.author_type := old.author_type; new.org_id := old.org_id;
    new.job_id := old.job_id; new.created_at := old.created_at;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status = 'draft') then new.published_at := now(); end if;
  return new;
end $$;
create trigger daily_logs_fill before insert or update on public.daily_logs for each row execute function private.daily_log_fill();

-- Row-based visibility (works for INSERT ... RETURNING)
create or replace function private.daily_log_visible(
  p_job uuid, p_created_by uuid, p_status public.log_status, p_internal boolean, p_subs boolean, p_clients boolean,
  p_author_type text, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and (
    p_created_by = auth.uid()
    or (p_status = 'published' and (
          (p_internal and private.can_module(p_job, 'daily_logs', 'view'))
       -- sub-authored logs always reach the builder's team
       or (p_author_type = 'sub' and private.can_module(p_job, 'daily_logs', 'view'))
       or (p_subs and private.is_job_sub(p_job) and (
             p_author_type = 'internal'
             -- a sub's log is shared with its own company, not other subs
             or exists (select 1 from public.org_members a join public.org_members b on b.org_id = a.org_id
                        join public.organizations o on o.id = a.org_id and o.kind = 'sub'
                        where a.user_id = p_created_by and b.user_id = auth.uid() and b.status = 'active')))
       or (p_clients and private.is_job_client(p_job))))
  );
$$;
grant execute on function private.daily_log_visible(uuid, uuid, public.log_status, boolean, boolean, boolean, text, timestamptz) to authenticated;

alter table public.daily_logs enable row level security;

create policy daily_logs_select on public.daily_logs for select to authenticated
  using (private.daily_log_visible(job_id, created_by, status, share_internal, share_subs, share_clients, author_type, deleted_at));
create policy daily_logs_insert on public.daily_logs for insert to authenticated
  with check (private.can_module(job_id, 'daily_logs', 'add') or private.is_job_sub(job_id));
create policy daily_logs_update on public.daily_logs for update to authenticated
  using (deleted_at is null and (created_by = (select auth.uid()) or private.can_module(job_id, 'daily_logs', 'edit')))
  with check (created_by = (select auth.uid()) or private.can_module(job_id, 'daily_logs', 'edit'));

create trigger audit_daily_logs after insert or update or delete on public.daily_logs for each row execute function private.audit();
revoke all on public.daily_logs from anon;
