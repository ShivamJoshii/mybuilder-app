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

select pg_temp.mkuser('owner', 'o@n.test'); select pg_temp.mkuser('sub', 's@n.test'); select pg_temp.mkuser('client', 'h@n.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Ntf Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'J1') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Sub One', 's@n.test');
insert into ids select 'so1', sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'H', 'h@n.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@n.test')); reset role;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'h@n.test')); reset role;

select pg_temp.login('owner');
insert into public.job_subs (job_id, sub_org_id) values (pg_temp.id('job'), pg_temp.id('so1'));
with x as (insert into public.todos (org_id, job_id, title) values (pg_temp.id('org'), pg_temp.id('job'), 'Rough-in') returning id) insert into ids select 't', id from x;
insert into public.todo_assignees (todo_id, sub_org_id) values (pg_temp.id('t'), pg_temp.id('so1'));
insert into public.daily_logs (org_id, job_id, notes, status, share_clients) values (pg_temp.id('org'), pg_temp.id('job'), 'Poured footings', 'published', true);
with x as (insert into public.rfis (org_id, job_id, title, question, due_date, assignee_sub_org_id) values (pg_temp.id('org'), pg_temp.id('job'), 'Q', 'Where?', current_date + 1, pg_temp.id('so1')) returning id) insert into ids select 'r', id from x;
select public.set_rfi_status(pg_temp.id('r'), 'send');
select is((select count(*)::int from public.notifications), 0, 'the actor gets no notifications about their own actions');
reset role;

select pg_temp.login('sub');
select is((select count(*)::int from public.notifications where type = 'job.added'), 1, 'sub told it was added to the job');
select is((select count(*)::int from public.notifications where type = 'todo.assigned'), 1, 'sub told about the to-do');
select is((select count(*)::int from public.notifications where type = 'rfi.assigned'), 1, 'sub told about the RFI');
insert into public.rfi_responses (rfi_id, body) values (pg_temp.id('r'), 'Here');
select public.mark_notifications_read();
select is((select count(*)::int from public.notifications where read_at is null), 0, 'mark all read');
reset role;

select pg_temp.login('client');
select is((select count(*)::int from public.notifications where type = 'daily_log.created'), 1, 'client told about the shared log');
select is((select count(*)::int from public.notifications where type <> 'daily_log.created'), 0, 'client gets nothing else');
reset role;

select pg_temp.login('owner');
select is((select count(*)::int from public.notifications where type = 'rfi.response'), 1, 'builder told about the sub''s response');
reset role;

select ok((select count(*) from public.notification_deliveries where channel = 'email') >= 5, 'email deliveries queued by default');

select * from finish();
rollback;
