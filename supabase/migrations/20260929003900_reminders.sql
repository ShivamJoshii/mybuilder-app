-- Reminder engine: a pg_cron job every 15 minutes turns due dates into notifications.
-- Each reminder fires once per (kind, record, user, key); reminder_log remembers what was sent.

insert into public.app_notification_types (key, grp, module, label, sort) values
  ('schedule.reminder',  'Project Management', 'Schedule',   'Reminder before a schedule item starts', 66),
  ('selection.deadline', 'Project Management', 'Selections', 'Selection deadline coming up', 34)
on conflict (key) do nothing;

create table public.reminder_log (
  kind     text not null,
  ref_id   uuid not null,
  user_id  uuid not null references auth.users (id) on delete cascade,
  fire_key text not null,
  sent_at  timestamptz not null default now(),
  primary key (kind, ref_id, user_id, fire_key)
);
alter table public.reminder_log enable row level security;   -- no policies: server only
create index reminder_log_sent_idx on public.reminder_log (sent_at);

-- Notify each user once for this (kind, ref, key)
create or replace function private.remind(p_users uuid[], p_kind text, p_ref uuid, p_key text, p_org uuid, p_job uuid,
                                          p_title text, p_body text, p_link text)
returns int language plpgsql security definer set search_path = '' as $$
declare v uuid[];
begin
  with ins as (
    insert into public.reminder_log (kind, ref_id, user_id, fire_key)
    select p_kind, p_ref, u, p_key from unnest(p_users) u where u is not null
    on conflict do nothing returning user_id
  ) select coalesce(array_agg(user_id), '{}') into v from ins;
  if cardinality(v) > 0 then perform private.notify(v, p_org, p_job, p_kind, p_title, p_body, p_link); end if;
  return cardinality(v);
end $$;

-- Active members of a sub org
create or replace function private.sub_users(p_sub uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(user_id), '{}') from public.org_members where org_id = p_sub and status = 'active';
$$;

create or replace function private.org_tz(p_org uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select timezone from public.organizations where id = p_org), 'America/Edmonton');
$$;

create or replace function private.run_reminders(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_title text;
begin
  -- 1. To-do reminders: N minutes before the due time
  for r in
    select t.* from public.todos t
    where t.completed_at is null and t.deleted_at is null and t.reminder_minutes is not null and t.due_at is not null
      and t.due_at - make_interval(mins => t.reminder_minutes) <= p_now and t.due_at > p_now - interval '1 day'
  loop
    n := n + private.remind(
      (select coalesce(array_agg(a.user_id) filter (where a.user_id is not null), '{}') from public.todo_assignees a where a.todo_id = r.id)
        || (select coalesce(array_agg(m.user_id), '{}') from public.todo_assignees a join public.org_members m on m.org_id = a.sub_org_id and m.status = 'active' where a.todo_id = r.id),
      'todo.reminder', r.id, r.due_at::text, r.org_id, r.job_id, 'Due soon: ' || r.title, null, '/todos/' || r.id);
  end loop;

  -- 2. Daily to-do digest from 7am company time: due today, tomorrow or overdue
  for r in
    with mine as (
      select coalesce(a.user_id, m.user_id) as uid, t.id, t.org_id, (t.due_at at time zone private.org_tz(t.org_id))::date due_day,
             (p_now at time zone private.org_tz(t.org_id))::date today, extract(hour from p_now at time zone private.org_tz(t.org_id)) hr
      from public.todos t join public.todo_assignees a on a.todo_id = t.id
      left join public.org_members m on m.org_id = a.sub_org_id and m.status = 'active'
      where t.completed_at is null and t.deleted_at is null and t.due_at is not null
    )
    select uid, min(org_id::text)::uuid org_id, min(today) today, count(*) filter (where due_day < today) overdue,
           count(*) filter (where due_day between today and today + 1) upcoming
    from mine where uid is not null and hr >= 7 and due_day <= today + 1 group by uid
  loop
    n := n + private.remind(array[r.uid], 'todo.daily_reminder', r.uid, r.today::text, r.org_id, null,
      'To-dos: ' || r.upcoming || ' due today or tomorrow' || case when r.overdue > 0 then ', ' || r.overdue || ' past due' else '' end, null, '/todos');
  end loop;

  -- 3. Schedule items: reminder_days before the start
  for r in
    select i.*, (p_now at time zone private.org_tz(i.org_id))::date today from public.schedule_items i join public.jobs j on j.id = i.job_id
    where i.deleted_at is null and i.completed_at is null and i.reminder_days is not null and not j.is_template and j.deleted_at is null
      and i.start_date - i.reminder_days <= (p_now at time zone private.org_tz(i.org_id))::date and i.start_date >= (p_now at time zone private.org_tz(i.org_id))::date
  loop
    n := n + private.remind(
      (select coalesce(array_agg(a.user_id) filter (where a.user_id is not null), '{}') from public.schedule_assignees a where a.item_id = r.id)
        || (select coalesce(array_agg(m.user_id), '{}') from public.schedule_assignees a join public.org_members m on m.org_id = a.sub_org_id and m.status = 'active' where a.item_id = r.id),
      'schedule.reminder', r.id, r.start_date::text, r.org_id, r.job_id,
      r.title || ' starts ' || case when r.start_date = r.today then 'today' when r.start_date = r.today + 1 then 'tomorrow' else to_char(r.start_date, 'Mon DD') end,
      null, '/schedule/' || r.id);
  end loop;

  -- 4. Bid deadlines: 24 hours out, to bidders who haven't answered
  for r in
    select p.id, p.org_id, p.job_id, p.title, p.due_at, q.sub_org_id from public.bid_packages p join public.bid_requests q on q.package_id = p.id
    where p.status = 'open' and p.deleted_at is null and p.due_at between p_now and p_now + interval '24 hours' and q.status = 'invited'
  loop
    n := n + private.remind(private.sub_users(r.sub_org_id), 'bid.deadline', r.id, r.due_at::text, r.org_id, r.job_id,
      'Bids due soon: ' || r.title, null, '/bids/' || r.id);
  end loop;

  -- 5. Selection deadlines: 3 days out, to the job's clients
  for r in
    select s.* from public.selections s
    where s.status = 'pending' and s.deleted_at is null and s.share_client
      and s.deadline between (p_now at time zone private.org_tz(s.org_id))::date and (p_now at time zone private.org_tz(s.org_id))::date + 3
  loop
    n := n + private.remind((select coalesce(array_agg(c.user_id), '{}') from public.job_clients c where c.job_id = r.job_id),
      'selection.deadline', r.id, r.deadline::text, r.org_id, r.job_id, 'Please choose by ' || to_char(r.deadline, 'Mon DD') || ': ' || r.title, null, '/selections/' || r.id);
  end loop;

  -- 6. Certificates expiring within 30 days (and on expiry): the sub's people and the builder's sub managers
  for r in
    select c.*, (c.expires_on < (p_now at time zone private.org_tz(c.builder_org_id))::date) expired from public.sub_certificates c
    where c.expires_on is not null and c.expires_on <= (p_now at time zone private.org_tz(c.builder_org_id))::date + 30
      and c.expires_on >= (p_now at time zone private.org_tz(c.builder_org_id))::date - 1
      and exists (select 1 from public.builder_sub_links l where l.builder_org_id = c.builder_org_id and l.sub_org_id = c.sub_org_id and l.status = 'active')
      and not exists (select 1 from public.sub_certificates newer where newer.builder_org_id = c.builder_org_id and newer.sub_org_id = c.sub_org_id
                        and newer.kind = c.kind and newer.expires_on > c.expires_on)
  loop
    v_title := (select company_name from public.builder_sub_links where builder_org_id = r.builder_org_id and sub_org_id = r.sub_org_id) || ': '
        || private.cert_label(r.kind) || case when r.expired then ' expired' else ' expires ' || to_char(r.expires_on, 'Mon DD') end;
    n := n + private.remind(private.sub_users(r.sub_org_id), 'admin.insurance_reminder', r.id, case when r.expired then 'expired' else '30d' end,
      r.builder_org_id, null, v_title, null, '/settings/compliance');
    n := n + private.remind((select coalesce(array_agg(m.user_id), '{}') from public.org_members m
        where m.org_id = r.builder_org_id and m.status = 'active' and exists (
          select 1 from public.role_permissions rp where rp.role_id = m.role_id and rp.module = 'subs_vendors' and rp.can_edit)),
      'admin.insurance_reminder', r.id, case when r.expired then 'expired' else '30d' end, r.builder_org_id, null, v_title, null,
      '/settings/subs/' || (select id from public.builder_sub_links where builder_org_id = r.builder_org_id and sub_org_id = r.sub_org_id));
  end loop;

  delete from public.reminder_log where sent_at < p_now - interval '120 days';
  return n;
end $$;
revoke execute on function private.run_reminders(timestamptz) from authenticated;
revoke execute on function private.remind(uuid[], text, uuid, text, uuid, uuid, text, text, text) from authenticated;

-- Every 15 minutes (pg_cron is available on Supabase; skipped quietly where it isn't)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('mybuilder-reminders', '*/15 * * * *', 'select private.run_reminders()');
exception when others then
  raise notice 'pg_cron not available: reminders must be run by an external scheduler (%).', sqlerrm;
end $$;
