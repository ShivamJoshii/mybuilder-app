begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;
create or replace function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;
create or replace function pg_temp.mkuser(p_key text, p_email text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '{}', now(), now());
  insert into ids values (p_key, v); return v;
end $$;
create or replace function pg_temp.login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_key), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
-- "now" for the run: 2026-10-05 09:00 Mountain
create or replace function pg_temp.at() returns timestamptz language sql as $$ select '2026-10-05 09:00 America/Edmonton'::timestamptz $$;

select pg_temp.mkuser('owner', 'o@rm.test'); select pg_temp.mkuser('pm', 'pm@rm.test'); select pg_temp.mkuser('sub', 's@rm.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Remind Co');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('org'), 'House', 'open') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Sub', 's@rm.test');
insert into ids select 'so', sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
insert into public.job_subs (job_id, sub_org_id) values (pg_temp.id('job'), pg_temp.id('so'));
select public.invite_internal_user(pg_temp.id('org'), 'pm@rm.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'project_manager'));
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('pm'); select public.accept_invite((select token from toks where email = 'pm@rm.test')); reset role;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@rm.test')); reset role;

select pg_temp.login('owner');
with x as (insert into public.todos (org_id, job_id, title, due_at, has_due_time, reminder_minutes) values
  (pg_temp.id('org'), pg_temp.id('job'), 'Call inspector', '2026-10-05 10:00 America/Edmonton', true, 120) returning id) insert into ids select 't1', id from x;
insert into public.todo_assignees (todo_id, user_id) values (pg_temp.id('t1'), pg_temp.id('pm'));
with x as (insert into public.todos (org_id, job_id, title, due_at) values (pg_temp.id('org'), pg_temp.id('job'), 'Late thing', '2026-10-01 17:00 America/Edmonton') returning id) insert into ids select 't2', id from x;
insert into public.todo_assignees (todo_id, user_id) values (pg_temp.id('t2'), pg_temp.id('pm'));
with x as (insert into public.schedule_items (org_id, job_id, title, start_date, duration, end_date, reminder_days) values
  (pg_temp.id('org'), pg_temp.id('job'), 'Roofing', '2026-10-06', 2, '2026-10-07', 1) returning id) insert into ids select 'i1', id from x;
insert into public.schedule_assignees (item_id, sub_org_id) values (pg_temp.id('i1'), pg_temp.id('so'));
insert into public.sub_certificates (builder_org_id, sub_org_id, kind, expires_on) values (pg_temp.id('org'), pg_temp.id('so'), 'wcb_clearance', '2026-10-20');
reset role;
delete from public.notifications;
select set_config('request.jwt.claims', '', true);  -- cron runs with no user

select ok(private.run_reminders(pg_temp.at()) > 0, 'the reminder run sends notifications');
select is((select count(*)::int from public.notifications where type = 'todo.reminder' and user_id = pg_temp.id('pm')), 1, 'to-do reminder goes to the assignee two hours before');
select is((select title from public.notifications where type = 'todo.daily_reminder' and user_id = pg_temp.id('pm')), 'To-dos: 1 due today or tomorrow, 1 past due', 'the 7am digest counts due and overdue');
select is((select title from public.notifications where type = 'schedule.reminder' and user_id = pg_temp.id('sub')), 'Roofing starts tomorrow', 'sub assignees are reminded the day before');
select is((select count(*)::int from public.notifications where type = 'admin.insurance_reminder' and user_id = pg_temp.id('sub')), 1, 'the sub hears about its expiring WCB clearance');
select is((select count(*)::int from public.notifications where type = 'admin.insurance_reminder' and user_id = pg_temp.id('owner')), 1, 'and so does the builder''s sub manager');
select is((select count(*)::int from public.notifications where type = 'admin.insurance_reminder' and user_id = pg_temp.id('pm')), 1, 'project managers can manage subs, so they hear too');
select is(private.run_reminders(pg_temp.at() + interval '15 minutes'), 0, 'running again sends nothing twice');
select is(private.run_reminders(pg_temp.at() + interval '1 day'), 1, 'the next morning only the new digest goes out');

select * from finish();
rollback;
