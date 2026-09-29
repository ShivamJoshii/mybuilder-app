-- =====================================================================
-- RFIs (requests for information) + threaded responses + related items.
-- Builders and subs can raise RFIs. A sub only sees RFIs its company
-- raised or was assigned. Clients never see RFIs.
-- =====================================================================

create type public.rfi_status as enum ('not_sent', 'sent', 'completed', 'reopened');

create table public.rfis (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  job_id              uuid not null references public.jobs (id) on delete cascade,
  number              int not null default 0,   -- set by trigger
  title               text not null check (length(trim(title)) between 1 and 200),
  question            text not null check (length(trim(question)) between 1 and 10000),
  due_date            date not null,
  status              public.rfi_status not null default 'not_sent',
  assignee_user_id    uuid references public.profiles (id) on delete set null,
  assignee_sub_org_id uuid references public.organizations (id) on delete set null,
  author_type         text not null default 'internal' check (author_type in ('internal', 'sub')),
  author_sub_org_id   uuid references public.organizations (id) on delete set null,
  created_by          uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  sent_at             timestamptz,
  completed_at        timestamptz,
  deleted_at          timestamptz,
  unique (job_id, number),
  check (assignee_user_id is null or assignee_sub_org_id is null)
);
create index rfis_job_idx on public.rfis (job_id) where deleted_at is null;
create trigger rfis_touch before update on public.rfis for each row execute function private.touch_updated_at();

create table public.rfi_responses (
  id          uuid primary key default gen_random_uuid(),
  rfi_id      uuid not null references public.rfis (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  body        text not null check (length(trim(body)) between 1 and 10000),
  created_at  timestamptz not null default now()
);
create index rfi_responses_rfi_idx on public.rfi_responses (rfi_id, created_at);

-- Generic links between records ("Related items")
create table public.related_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  job_id      uuid not null references public.jobs (id) on delete cascade,
  from_type   text not null check (from_type ~ '^[a-z_]{2,40}$'),
  from_id     uuid not null,
  to_type     text not null check (to_type ~ '^[a-z_]{2,40}$'),
  to_id       uuid not null,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  unique (from_type, from_id, to_type, to_id)
);
create or replace function private.related_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select org_id into new.org_id from public.jobs where id = new.job_id;
  new.created_by := auth.uid();
  return new;
end $$;
create trigger related_items_fill before insert on public.related_items for each row execute function private.related_fill();

create index related_items_from on public.related_items (from_type, from_id);
create index related_items_to on public.related_items (to_type, to_id);

-- Caller's active sub org on a job (null if none)
create or replace function private.my_sub_on_job(p_job uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select js.sub_org_id from public.job_subs js
  join public.org_members m on m.org_id = js.sub_org_id and m.user_id = auth.uid() and m.status = 'active'
  where js.job_id = p_job and private.is_job_sub(p_job) limit 1;
$$;

-- Fill number, org, author; enforce who may be assigned
create or replace function private.rfi_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_sub uuid; v_can_assign boolean;
begin
  if tg_op = 'INSERT' then
    select org_id into new.org_id from public.jobs where id = new.job_id;
    perform pg_advisory_xact_lock(hashtext('rfi:' || new.job_id::text));
    select coalesce(max(number), 0) + 1 into new.number from public.rfis where job_id = new.job_id;
    new.created_by := auth.uid();
    new.status := 'not_sent'; new.sent_at := null; new.completed_at := null;
    if private.is_job_internal(new.job_id) then
      new.author_type := 'internal'; new.author_sub_org_id := null;
    else
      v_sub := private.my_sub_on_job(new.job_id);
      if v_sub is null then raise exception 'Not allowed' using errcode = '42501'; end if;
      new.author_type := 'sub'; new.author_sub_org_id := v_sub;
    end if;
  else
    new.org_id := old.org_id; new.job_id := old.job_id; new.number := old.number; new.created_by := old.created_by;
    new.author_type := old.author_type; new.author_sub_org_id := old.author_sub_org_id; new.created_at := old.created_at;
    -- status only changes through set_rfi_status()
    if current_setting('app.rfi_status', true) is distinct from 'on' then
      new.status := old.status; new.sent_at := old.sent_at; new.completed_at := old.completed_at;
    end if;
  end if;

  -- assignee rules
  if new.assignee_user_id is not null and not exists (
       select 1 from public.org_members where org_id = new.org_id and user_id = new.assignee_user_id and status = 'active') then
    raise exception 'RFIs can be assigned to builder staff or subs on the job' using errcode = '23514';
  end if;
  if new.assignee_sub_org_id is not null then
    if not exists (select 1 from public.job_subs where job_id = new.job_id and sub_org_id = new.assignee_sub_org_id) then
      raise exception 'That sub is not on this job' using errcode = '23514';
    end if;
    if new.author_type = 'sub' and new.assignee_sub_org_id <> new.author_sub_org_id then
      select can_assign_rfis_to_subs into v_can_assign from public.job_subs where job_id = new.job_id and sub_org_id = new.author_sub_org_id;
      if not coalesce(v_can_assign, false) then
        raise exception 'Your builder has not allowed you to assign RFIs to other subs' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger rfis_fill before insert or update on public.rfis for each row execute function private.rfi_fill();

create or replace function private.rfi_visible(p_job uuid, p_status public.rfi_status, p_created_by uuid, p_author_sub uuid, p_assignee_user uuid, p_assignee_sub uuid, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and (
    p_created_by = auth.uid()
    or (p_status <> 'not_sent' and (
         private.can_module(p_job, 'rfis', 'view')
      or (private.is_job_sub(p_job) and (
            p_assignee_user = auth.uid()
         or exists (select 1 from public.org_members m where m.user_id = auth.uid() and m.status = 'active'
                    and m.org_id in (p_author_sub, p_assignee_sub)))))));
$$;

create or replace function private.can_see_rfi(p_rfi uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.rfi_visible(r.job_id, r.status, r.created_by, r.author_sub_org_id, r.assignee_user_id, r.assignee_sub_org_id, r.deleted_at)
                   from public.rfis r where r.id = p_rfi), false);
$$;
grant execute on function private.rfi_visible(uuid, public.rfi_status, uuid, uuid, uuid, uuid, timestamptz) to authenticated;
grant execute on function private.can_see_rfi(uuid) to authenticated;
grant execute on function private.my_sub_on_job(uuid) to authenticated;

-- send | complete | reopen | incomplete
create or replace function public.set_rfi_status(p_rfi uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.rfis; v_is_internal_editor boolean; v_assignee boolean;
begin
  select * into r from public.rfis where id = p_rfi and deleted_at is null for update;
  if r.id is null or not private.can_see_rfi(p_rfi) then raise exception 'Not allowed' using errcode = '42501'; end if;
  v_is_internal_editor := private.can_module(r.job_id, 'rfis', 'edit');
  v_assignee := r.assignee_user_id = auth.uid()
    or exists (select 1 from public.org_members m where m.org_id = r.assignee_sub_org_id and m.user_id = auth.uid() and m.status = 'active');
  perform set_config('app.rfi_status', 'on', true);
  if p_action = 'send' then
    if r.status <> 'not_sent' or not (r.created_by = auth.uid() or v_is_internal_editor) then raise exception 'Not allowed' using errcode = '42501'; end if;
    update public.rfis set status = 'sent', sent_at = now() where id = p_rfi;
  elsif p_action = 'complete' then
    if r.status not in ('sent', 'reopened') or not (r.created_by = auth.uid() or v_is_internal_editor or v_assignee) then raise exception 'Not allowed' using errcode = '42501'; end if;
    update public.rfis set status = 'completed', completed_at = now() where id = p_rfi;
  elsif p_action in ('reopen', 'incomplete') then
    if r.status <> 'completed' or not (r.created_by = auth.uid() or v_is_internal_editor) then raise exception 'Not allowed' using errcode = '42501'; end if;
    update public.rfis set status = 'reopened', completed_at = null where id = p_rfi;
  else
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  perform set_config('app.rfi_status', 'off', true);
end $$;
revoke execute on function public.set_rfi_status(uuid, text) from public, anon;
grant execute on function public.set_rfi_status(uuid, text) to authenticated;

alter table public.rfis enable row level security;
alter table public.rfi_responses enable row level security;
alter table public.related_items enable row level security;

create policy rfis_select on public.rfis for select to authenticated
  using (private.rfi_visible(job_id, status, created_by, author_sub_org_id, assignee_user_id, assignee_sub_org_id, deleted_at));
create policy rfis_insert on public.rfis for insert to authenticated
  with check (private.can_module(job_id, 'rfis', 'add') or private.my_sub_on_job(job_id) is not null);
create policy rfis_update on public.rfis for update to authenticated
  using (deleted_at is null and ((created_by = (select auth.uid()) and status = 'not_sent') or private.can_module(job_id, 'rfis', 'edit')))
  with check ((created_by = (select auth.uid())) or private.can_module(job_id, 'rfis', 'edit'));

create policy rfi_responses_select on public.rfi_responses for select to authenticated using (private.can_see_rfi(rfi_id));
create policy rfi_responses_insert on public.rfi_responses for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_see_rfi(rfi_id)
              and exists (select 1 from public.rfis r where r.id = rfi_id and r.status in ('sent', 'reopened')));

create policy related_select on public.related_items for select to authenticated
  using (private.is_job_internal(job_id) or (from_type = 'rfi' and private.can_see_rfi(from_id)));
create policy related_insert on public.related_items for insert to authenticated
  with check (created_by = (select auth.uid()) and (
    private.can_module(job_id, 'jobs', 'view') or (from_type = 'rfi' and private.can_see_rfi(from_id))));
create policy related_delete on public.related_items for delete to authenticated
  using (created_by = (select auth.uid()) or private.is_job_internal(job_id));

create trigger audit_rfis after insert or update or delete on public.rfis for each row execute function private.audit();
revoke all on public.rfis, public.rfi_responses, public.related_items from anon;
