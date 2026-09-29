-- =====================================================================
-- Notifications engine
--   * app_notification_types: the catalog (spec's 35 events + a few more)
--   * notification_prefs: per user × event × channel (email / text / push)
--   * notifications: in-app feed (the bell)
--   * notification_deliveries: outbox for email/SMS/push, drained by a worker
-- Module triggers call private.notify(); recipients never include the actor.
-- =====================================================================

create table public.app_notification_types (
  key            text primary key,
  grp            text not null,         -- Project Management, Messaging, Financial, Administrative, Jobs
  module         text not null,
  label          text not null,
  default_email  boolean not null default true,
  default_text   boolean not null default false,
  default_push   boolean not null default true,
  sort           int not null
);

insert into public.app_notification_types (key, grp, module, label, sort) values
  ('job.added',                    'Jobs',               'Jobs',            'Added to a job', 5),
  ('daily_log.created',            'Project Management', 'Daily Logs',      'New daily log shared with you', 10),
  ('change_order.approved',        'Project Management', 'Change Orders',   'Change order approved by client', 20),
  ('selection.approved_vendor',    'Project Management', 'Selections',      'Choice approved (you are the vendor)', 30),
  ('selection.approved_installer', 'Project Management', 'Selections',      'Choice approved (you are the installer)', 31),
  ('warranty.acceptance_requested','Project Management', 'Warranty',        'Service appointment acceptance requested', 40),
  ('warranty.scheduled',           'Project Management', 'Warranty',        'Service appointment scheduled', 41),
  ('warranty.date_changed',        'Project Management', 'Warranty',        'Service appointment date changed', 42),
  ('spec.published',               'Project Management', 'Specifications',  'Specification published', 50),
  ('todo.assigned',                'Project Management', 'Tasks',           'To-do assigned to you', 60),
  ('todo.daily_reminder',          'Project Management', 'Tasks',           'Daily reminder: due today, tomorrow or past due', 61),
  ('todo.reminder',                'Project Management', 'Tasks',           'Reminder before a to-do is due', 62),
  ('todo.date_changed',            'Project Management', 'Tasks',           'To-do date or time changed', 63),
  ('todo.completed',               'Project Management', 'Tasks',           'To-do marked complete or incomplete', 64),
  ('comment.added',                'Messaging',          'Comments',        'New comment on something you follow', 70),
  ('message.received',             'Messaging',          'Messages',        'New message received', 71),
  ('rfi.assigned',                 'Messaging',          'RFIs',            'RFI sent to you', 80),
  ('rfi.response',                 'Messaging',          'RFIs',            'New response to an RFI', 81),
  ('rfi.status',                   'Messaging',          'RFIs',            'RFI marked complete or reopened', 82),
  ('bid.released',                 'Financial',          'Bids',            'Bid request released', 90),
  ('bid.decision',                 'Financial',          'Bids',            'Bid approved or declined by builder', 91),
  ('bid.reset',                    'Financial',          'Bids',            'Bid status reset to In Progress', 92),
  ('bid.submitted_by_builder',     'Financial',          'Bids',            'Bid submitted on your behalf', 93),
  ('bid.reopened',                 'Financial',          'Bids',            'Bid package reopened', 94),
  ('bid.deadline',                 'Financial',          'Bids',            'Bid deadline reminder', 95),
  ('bid.files',                    'Financial',          'Bids',            'Files attached to a bid package', 96),
  ('bid.receipt',                  'Financial',          'Bids',            'Bid receipt sent', 97),
  ('po.amended',                   'Financial',          'Purchase Orders', 'Purchase order amended', 100),
  ('po.sent',                      'Financial',          'Purchase Orders', 'Purchase order sent by builder', 101),
  ('po.approval_reminder',         'Financial',          'Purchase Orders', 'Purchase order approval reminder', 102),
  ('po.work_completed',            'Financial',          'Purchase Orders', 'Work completed by a sub/vendor', 103),
  ('po.payment_receipt',           'Financial',          'Purchase Orders', 'Payment receipt sent', 104),
  ('bill.voided',                  'Financial',          'Bills',           'Bill voided', 110),
  ('bill.holdback_released',       'Financial',          'Bills',           'Holdback released', 111),
  ('bill.lien_waiver_files',       'Financial',          'Bills',           'Files attached to a lien waiver', 112),
  ('bill.paid',                    'Financial',          'Bills',           'Bill marked as paid', 113),
  ('admin.insurance_reminder',     'Administrative',     'Sub/Vendor Information', 'Insurance certificate reminder', 120);

create table public.notification_prefs (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  type     text not null references public.app_notification_types (key) on delete cascade,
  email    boolean not null,
  text     boolean not null,
  push     boolean not null,
  primary key (user_id, type)
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  org_id      uuid references public.organizations (id) on delete cascade,
  job_id      uuid references public.jobs (id) on delete cascade,
  type        text not null references public.app_notification_types (key),
  title       text not null,
  body        text,
  link        text,
  actor_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create type public.delivery_channel as enum ('email', 'text', 'push');
create type public.delivery_status as enum ('queued', 'sent', 'failed', 'skipped');

create table public.notification_deliveries (
  id               uuid primary key default gen_random_uuid(),
  notification_id  uuid not null references public.notifications (id) on delete cascade,
  channel          public.delivery_channel not null,
  status           public.delivery_status not null default 'queued',
  attempts         int not null default 0,
  last_error       text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);
create index notification_deliveries_queue on public.notification_deliveries (created_at) where status = 'queued';

-- Core: create in-app notifications + queue deliveries per the user's prefs
create or replace function private.notify(
  p_users uuid[], p_org uuid, p_job uuid, p_type text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid; v_id uuid; t public.app_notification_types; p public.notification_prefs;
begin
  select * into t from public.app_notification_types where key = p_type;
  if t.key is null then return; end if;
  for u in select distinct x from unnest(p_users) x where x is not null and x is distinct from auth.uid() loop
    insert into public.notifications (user_id, org_id, job_id, type, title, body, link, actor_id)
    values (u, p_org, p_job, p_type, left(p_title, 200), left(p_body, 500), p_link, auth.uid())
    returning id into v_id;
    select * into p from public.notification_prefs where user_id = u and type = p_type;
    if coalesce(p.email, t.default_email) then insert into public.notification_deliveries (notification_id, channel) values (v_id, 'email'); end if;
    if coalesce(p.text, t.default_text) then insert into public.notification_deliveries (notification_id, channel) values (v_id, 'text'); end if;
    if coalesce(p.push, t.default_push) then insert into public.notification_deliveries (notification_id, channel) values (v_id, 'push'); end if;
  end loop;
end $$;

-- Active members of an org (sub companies receive as a team)
create or replace function private.org_users(p_org uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(user_id), '{}') from public.org_members where org_id = p_org and status = 'active';
$$;

-- ---------------------------------------------------------------------
-- Module triggers
-- ---------------------------------------------------------------------

create or replace function private.ntf_job_sub_added()
returns trigger language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id = new.job_id;
  perform private.notify(private.org_users(new.sub_org_id), j.org_id, j.id, 'job.added',
    'You were added to ' || j.title, null, '/jobs/' || j.id);
  return null;
end $$;
create trigger ntf_job_subs after insert on public.job_subs for each row execute function private.ntf_job_sub_added();

create or replace function private.ntf_todo_assigned()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t public.todos;
begin
  select * into t from public.todos where id = new.todo_id;
  perform private.notify(case when new.user_id is not null then array[new.user_id] else private.org_users(new.sub_org_id) end,
    t.org_id, t.job_id, 'todo.assigned', 'To-do assigned: ' || t.title, null, '/todos/' || t.id);
  return null;
end $$;
create trigger ntf_todo_assignees after insert on public.todo_assignees for each row execute function private.ntf_todo_assigned();

create or replace function private.ntf_todo_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_users uuid[];
begin
  select array_agg(distinct u) into v_users from (
    select new.created_by u
    union select w.user_id from public.todo_watchers w where w.todo_id = new.id
    union select a.user_id from public.todo_assignees a where a.todo_id = new.id and a.user_id is not null
    union select m.user_id from public.todo_assignees a join public.org_members m on m.org_id = a.sub_org_id and m.status = 'active'
          where a.todo_id = new.id) s;
  if (old.completed_at is null) <> (new.completed_at is null) then
    perform private.notify(v_users, new.org_id, new.job_id, 'todo.completed',
      case when new.completed_at is not null then 'To-do completed: ' else 'To-do reopened: ' end || new.title, null, '/todos/' || new.id);
  elsif old.due_at is distinct from new.due_at then
    perform private.notify(v_users, new.org_id, new.job_id, 'todo.date_changed', 'Due date changed: ' || new.title, null, '/todos/' || new.id);
  end if;
  return null;
end $$;
create trigger ntf_todos after update on public.todos for each row execute function private.ntf_todo_changed();

create or replace function private.ntf_daily_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_users uuid[] := '{}'; j public.jobs;
begin
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status = 'published') or new.deleted_at is not null then return null; end if;
  select * into j from public.jobs where id = new.job_id;
  if new.share_subs and new.author_type = 'internal' then
    select v_users || coalesce(array_agg(m.user_id), '{}') into v_users
    from public.job_subs js join public.org_members m on m.org_id = js.sub_org_id and m.status = 'active' where js.job_id = new.job_id;
  end if;
  if new.share_clients then
    select v_users || coalesce(array_agg(c.user_id), '{}') into v_users from public.job_clients c where c.job_id = new.job_id and c.user_id is not null;
  end if;
  if new.author_type = 'sub' then
    select v_users || coalesce(array_agg(user_id), '{}') into v_users from public.job_managers where job_id = new.job_id;
  end if;
  perform private.notify(v_users, j.org_id, j.id, 'daily_log.created', 'New daily log on ' || j.title, left(new.notes, 140), '/daily-logs/' || new.id);
  return null;
end $$;
create trigger ntf_daily_logs after insert or update on public.daily_logs for each row execute function private.ntf_daily_log();

create or replace function private.rfi_parties(r public.rfis)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct u), '{}') from (
    select r.created_by u
    union select r.assignee_user_id
    union select unnest(private.org_users(r.assignee_sub_org_id))
    union select unnest(private.org_users(r.author_sub_org_id))
    union select jm.user_id from public.job_managers jm where jm.job_id = r.job_id and r.assignee_user_id is null and r.assignee_sub_org_id is null
  ) s where u is not null;
$$;

create or replace function private.ntf_rfi()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'not_sent' and new.status = 'sent' then
    perform private.notify(private.rfi_parties(new), new.org_id, new.job_id, 'rfi.assigned',
      'RFI #' || new.number || ': ' || new.title, left(new.question, 140), '/rfis/' || new.id);
  elsif old.status <> new.status and new.status in ('completed', 'reopened') then
    perform private.notify(private.rfi_parties(new), new.org_id, new.job_id, 'rfi.status',
      'RFI #' || new.number || ' ' || case when new.status = 'completed' then 'completed' else 'reopened' end || ': ' || new.title, null, '/rfis/' || new.id);
  end if;
  return null;
end $$;
create trigger ntf_rfis after update on public.rfis for each row execute function private.ntf_rfi();

create or replace function private.ntf_rfi_response()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.rfis;
begin
  select * into r from public.rfis where id = new.rfi_id;
  perform private.notify(private.rfi_parties(r), r.org_id, r.job_id, 'rfi.response',
    'New response on RFI #' || r.number || ': ' || r.title, left(new.body, 140), '/rfis/' || r.id);
  return null;
end $$;
create trigger ntf_rfi_responses after insert on public.rfi_responses for each row execute function private.ntf_rfi_response();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.app_notification_types enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;

create policy ntf_types_select on public.app_notification_types for select to authenticated using (true);
create policy ntf_prefs_all on public.notification_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ntf_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy ntf_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- deliveries: worker only (service role); no user policies

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security invoker set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

revoke all on public.notifications, public.notification_prefs, public.notification_deliveries, public.app_notification_types from anon;
