-- =====================================================================
-- To-dos (tasks): assignees (internal users, sub companies, clients),
-- watchers, checklist, priority, tags, deadline + reminder.
-- =====================================================================

create type public.todo_priority as enum ('low', 'medium', 'high');

-- Internal user may use a module on a job (job access + role permission)
create or replace function private.can_module(p_job uuid, p_module text, p_verb text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_job_internal(p_job) and private.has_perm(private.job_org(p_job), p_module, p_verb);
$$;
grant execute on function private.can_module(uuid, text, text) to authenticated;

create table public.todos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  job_id        uuid not null references public.jobs (id) on delete cascade,
  title         text not null check (length(trim(title)) between 1 and 200),
  notes         text check (length(notes) <= 8000),
  priority      public.todo_priority not null default 'medium',
  due_at        timestamptz,
  has_due_time  boolean not null default false,
  reminder_minutes int check (reminder_minutes is null or reminder_minutes between 0 and 20160),
  tag_ids       uuid[] not null default '{}',
  completed_at  timestamptz,
  completed_by  uuid references public.profiles (id) on delete set null,
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index todos_job_idx on public.todos (job_id) where deleted_at is null;
create index todos_due_idx on public.todos (due_at) where deleted_at is null and completed_at is null;
create trigger todos_touch before update on public.todos for each row execute function private.touch_updated_at();

create table public.todo_assignees (
  todo_id     uuid not null references public.todos (id) on delete cascade,
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete cascade,      -- internal user or client
  sub_org_id  uuid references public.organizations (id) on delete cascade, -- sub company
  check ((user_id is null) <> (sub_org_id is null))
);
create unique index todo_assignees_user on public.todo_assignees (todo_id, user_id) where user_id is not null;
create unique index todo_assignees_sub on public.todo_assignees (todo_id, sub_org_id) where sub_org_id is not null;
create index todo_assignees_user_idx on public.todo_assignees (user_id);
create index todo_assignees_sub_idx on public.todo_assignees (sub_org_id);

create table public.todo_watchers (
  todo_id  uuid not null references public.todos (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (todo_id, user_id)
);

create table public.todo_checklist (
  id           uuid primary key default gen_random_uuid(),
  todo_id      uuid not null references public.todos (id) on delete cascade,
  body         text not null check (length(trim(body)) between 1 and 300),
  sort         int not null default 0,
  done_at      timestamptz,
  done_by      uuid references public.profiles (id) on delete set null
);
create index todo_checklist_todo_idx on public.todo_checklist (todo_id, sort);

-- Fill org from job
create or replace function private.todo_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select org_id into new.org_id from public.jobs where id = new.job_id;
  return new;
end $$;
create trigger todos_fill before insert on public.todos for each row execute function private.todo_fill();

-- The caller is an assignee (directly, or through their sub company)
create or replace function private.is_todo_assignee(p_todo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.todo_assignees a
    where a.todo_id = p_todo and (
      a.user_id = auth.uid()
      or exists (select 1 from public.org_members m where m.org_id = a.sub_org_id and m.user_id = auth.uid() and m.status = 'active'))
  );
$$;

-- Row-based check (works for INSERT ... RETURNING, where the row is not yet visible to lookups)
create or replace function private.todo_visible(p_id uuid, p_job uuid, p_org uuid, p_created_by uuid, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and (
    -- internal: module view on the job; 'own' scope limits to created/assigned/watched
    (private.can_module(p_job, 'todos', 'view') and (
       private.perm_scope(p_org, 'todos') <> 'own'
       or p_created_by = auth.uid()
       or private.is_todo_assignee(p_id)
       or exists (select 1 from public.todo_watchers w where w.todo_id = p_id and w.user_id = auth.uid())))
    -- subs and clients: only to-dos assigned to them on jobs they can open
    or ((private.is_job_sub(p_job) or private.is_job_client(p_job)) and private.is_todo_assignee(p_id))
  );
$$;

create or replace function private.can_see_todo(p_todo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.todo_visible(t.id, t.job_id, t.org_id, t.created_by, t.deleted_at)
                   from public.todos t where t.id = p_todo), false);
$$;
grant execute on function private.todo_visible(uuid, uuid, uuid, uuid, timestamptz) to authenticated;

-- Complete / reopen: assignees (any user type) or internal editors
create or replace function public.set_todo_complete(p_todo uuid, p_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_job uuid;
begin
  select job_id into v_job from public.todos where id = p_todo and deleted_at is null;
  if v_job is null or not (private.is_todo_assignee(p_todo) or private.can_module(v_job, 'todos', 'edit')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_done and exists (select 1 from public.todo_checklist where todo_id = p_todo and done_at is null) then
    raise exception 'Finish every checklist item first' using errcode = '23514';
  end if;
  update public.todos set completed_at = case when p_done then now() end,
                          completed_by = case when p_done then auth.uid() end
  where id = p_todo;
end $$;

create or replace function public.set_checklist_item(p_item uuid, p_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_todo uuid; v_job uuid;
begin
  select c.todo_id, t.job_id into v_todo, v_job
  from public.todo_checklist c join public.todos t on t.id = c.todo_id where c.id = p_item and t.deleted_at is null;
  if v_todo is null or not (private.is_todo_assignee(v_todo) or private.can_module(v_job, 'todos', 'edit')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.todo_checklist set done_at = case when p_done then now() end, done_by = case when p_done then auth.uid() end
  where id = p_item;
end $$;

revoke execute on function public.set_todo_complete(uuid, boolean) from public, anon;
revoke execute on function public.set_checklist_item(uuid, boolean) from public, anon;
grant execute on function public.set_todo_complete(uuid, boolean) to authenticated;
grant execute on function public.set_checklist_item(uuid, boolean) to authenticated;
grant execute on function private.is_todo_assignee(uuid) to authenticated;
grant execute on function private.can_see_todo(uuid) to authenticated;

-- Assignees must belong to the job: internal users of the builder, subs on the job, clients on the job
create or replace function private.check_todo_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_job uuid; v_org uuid;
begin
  select job_id, org_id into v_job, v_org from public.todos where id = new.todo_id;
  if new.sub_org_id is not null then
    if not exists (select 1 from public.job_subs where job_id = v_job and sub_org_id = new.sub_org_id) then
      raise exception 'That sub is not on this job' using errcode = '23514';
    end if;
  elsif not exists (select 1 from public.org_members where org_id = v_org and user_id = new.user_id)
    and not exists (select 1 from public.job_clients where job_id = v_job and user_id = new.user_id) then
    raise exception 'Assignee is not part of this job' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger todo_assignees_check before insert or update on public.todo_assignees
  for each row execute function private.check_todo_assignee();

alter table public.todos           enable row level security;
alter table public.todo_assignees  enable row level security;
alter table public.todo_watchers   enable row level security;
alter table public.todo_checklist  enable row level security;

create policy todos_select on public.todos for select to authenticated
  using (private.todo_visible(id, job_id, org_id, created_by, deleted_at));
create policy todos_insert on public.todos for insert to authenticated
  with check (created_by = (select auth.uid()) and private.can_module(job_id, 'todos', 'add'));
create policy todos_update on public.todos for update to authenticated
  using (private.can_module(job_id, 'todos', 'edit') and private.todo_visible(id, job_id, org_id, created_by, deleted_at))
  with check (private.can_module(job_id, 'todos', 'edit'));
create policy todos_delete on public.todos for delete to authenticated
  using (private.can_module(job_id, 'todos', 'delete'));

create policy todo_assignees_select on public.todo_assignees for select to authenticated using (private.can_see_todo(todo_id));
create policy todo_assignees_write on public.todo_assignees for all to authenticated
  using (exists (select 1 from public.todos t where t.id = todo_id and private.can_module(t.job_id, 'todos', 'edit')))
  with check (exists (select 1 from public.todos t where t.id = todo_id and (private.can_module(t.job_id, 'todos', 'edit') or (t.created_by = (select auth.uid()) and private.can_module(t.job_id, 'todos', 'add')))));

create policy todo_watchers_select on public.todo_watchers for select to authenticated using (private.can_see_todo(todo_id));
create policy todo_watchers_write on public.todo_watchers for all to authenticated
  using (exists (select 1 from public.todos t where t.id = todo_id and private.can_module(t.job_id, 'todos', 'edit')))
  with check (exists (select 1 from public.todos t where t.id = todo_id and (private.can_module(t.job_id, 'todos', 'edit') or (t.created_by = (select auth.uid()) and private.can_module(t.job_id, 'todos', 'add')))));

create policy todo_checklist_select on public.todo_checklist for select to authenticated using (private.can_see_todo(todo_id));
create policy todo_checklist_write on public.todo_checklist for all to authenticated
  using (exists (select 1 from public.todos t where t.id = todo_id and private.can_module(t.job_id, 'todos', 'edit')))
  with check (exists (select 1 from public.todos t where t.id = todo_id and (private.can_module(t.job_id, 'todos', 'edit') or (t.created_by = (select auth.uid()) and private.can_module(t.job_id, 'todos', 'add')))));

create trigger audit_todos after insert or update or delete on public.todos for each row execute function private.audit();
revoke all on public.todos, public.todo_assignees, public.todo_watchers, public.todo_checklist from anon;
