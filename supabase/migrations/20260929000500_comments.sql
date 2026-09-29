-- =====================================================================
-- Comments: threaded comments on any record, with per-comment audience.
-- Internal users see all comments on jobs they can open; subs and clients
-- only see comments shared with them.
-- =====================================================================

create table public.comments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  job_id              uuid not null references public.jobs (id) on delete cascade,
  record_type         text not null check (record_type ~ '^[a-z_]{2,40}$'),   -- job, daily_log, file, change_order, ...
  record_id           uuid not null,
  parent_id           uuid references public.comments (id) on delete cascade,
  author_id           uuid not null references public.profiles (id) on delete cascade,
  author_type         text not null check (author_type in ('internal', 'sub', 'client')),
  body                text not null check (length(trim(body)) between 1 and 4000),
  visible_to_subs     boolean not null default false,
  visible_to_clients  boolean not null default false,
  created_at          timestamptz not null default now(),
  edited_at           timestamptz,
  deleted_at          timestamptz
);
create index comments_record_idx on public.comments (record_type, record_id, created_at);
create index comments_job_idx on public.comments (job_id, created_at desc);

-- Fill org, author and author type; subs and clients always share with their own audience
create or replace function private.before_comment_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select org_id into new.org_id from public.jobs where id = new.job_id;
  new.author_id := auth.uid();
  if private.is_job_internal(new.job_id) then
    new.author_type := 'internal';
  elsif private.is_job_sub(new.job_id) then
    new.author_type := 'sub';
    new.visible_to_subs := true;
    -- a sub may only show a comment to the client when the builder allowed it on this job
    if new.visible_to_clients and not exists (
      select 1 from public.job_subs js join public.org_members m on m.org_id = js.sub_org_id
      where js.job_id = new.job_id and js.can_share_with_client and m.user_id = auth.uid() and m.status = 'active') then
      new.visible_to_clients := false;
    end if;
  elsif private.is_job_client(new.job_id) then
    new.author_type := 'client';
    new.visible_to_clients := true;
    new.visible_to_subs := false;
  else
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if new.parent_id is not null and not exists (
    select 1 from public.comments p where p.id = new.parent_id and p.record_type = new.record_type and p.record_id = new.record_id) then
    raise exception 'Reply must be on the same record' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger comments_before_insert before insert on public.comments
  for each row execute function private.before_comment_insert();

-- Only the body (and soft delete) can change after posting
create or replace function private.before_comment_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  new.org_id := old.org_id; new.job_id := old.job_id; new.record_type := old.record_type;
  new.record_id := old.record_id; new.parent_id := old.parent_id; new.author_id := old.author_id;
  new.author_type := old.author_type; new.created_at := old.created_at;
  return new;
end $$;
create trigger comments_before_update before update on public.comments
  for each row execute function private.before_comment_update();

create or replace function private.can_see_comment(p_job uuid, p_subs boolean, p_clients boolean, p_author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_author = auth.uid()
      or private.is_job_internal(p_job)
      or (p_subs and private.is_job_sub(p_job))
      or (p_clients and private.is_job_client(p_job));
$$;
grant execute on function private.can_see_comment(uuid, boolean, boolean, uuid) to authenticated;

alter table public.comments enable row level security;

create policy comments_select on public.comments for select to authenticated
  using (deleted_at is null and private.can_see_comment(job_id, visible_to_subs, visible_to_clients, author_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_see_job(job_id));
create policy comments_update on public.comments for update to authenticated
  using (author_id = (select auth.uid()) or (private.is_job_internal(job_id) and private.has_perm(org_id, 'messages', 'delete')))
  with check (author_id = (select auth.uid()) or (private.is_job_internal(job_id) and private.has_perm(org_id, 'messages', 'delete')));

create trigger audit_comments after insert or update or delete on public.comments
  for each row execute function private.audit();

revoke all on public.comments from anon;

-- Post a comment (fills org/author server side)
create or replace function public.add_comment(
  p_job uuid, p_record_type text, p_record_id uuid, p_body text,
  p_parent uuid default null, p_visible_to_subs boolean default false, p_visible_to_clients boolean default false)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  select org_id into v_org from public.jobs where id = p_job;
  insert into public.comments (org_id, job_id, record_type, record_id, parent_id, author_id, author_type, body, visible_to_subs, visible_to_clients)
  values (v_org, p_job, p_record_type, p_record_id, p_parent, auth.uid(), 'internal', trim(p_body), p_visible_to_subs, p_visible_to_clients)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.add_comment(uuid, text, uuid, text, uuid, boolean, boolean) from public, anon;
grant execute on function public.add_comment(uuid, text, uuid, text, uuid, boolean, boolean) to authenticated;
