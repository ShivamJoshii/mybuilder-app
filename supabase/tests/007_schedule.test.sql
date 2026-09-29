begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(11);

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

select pg_temp.mkuser('owner', 'o@s.test'); select pg_temp.mkuser('sub', 's@s.test'); select pg_temp.mkuser('client', 'h@s.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Sched Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'J1') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Sub One', 's@s.test');
insert into ids select 'so1', sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
insert into public.job_subs (job_id, sub_org_id) values (pg_temp.id('job'), pg_temp.id('so1'));
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'H', 'h@s.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
with x as (insert into public.schedule_items (org_id, job_id, title, start_date, duration, end_date, show_client) values (pg_temp.id('org'), pg_temp.id('job'), 'Framing', '2026-10-05', 5, '2026-10-09', true) returning id) insert into ids select 'frame', id from x;
with x as (insert into public.schedule_items (org_id, job_id, title, start_date, duration, end_date, show_subs) values (pg_temp.id('org'), pg_temp.id('job'), 'Electrical', '2026-10-12', 3, '2026-10-14', true) returning id) insert into ids select 'elec', id from x;
insert into public.schedule_assignees (item_id, sub_org_id) values (pg_temp.id('frame'), pg_temp.id('so1'));
insert into public.schedule_links (predecessor_id, successor_id) values (pg_temp.id('frame'), pg_temp.id('elec'));
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@s.test')); reset role;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'h@s.test')); reset role;

select pg_temp.login('sub');
select is((select count(*)::int from public.schedule_items), 0, 'offline schedule is hidden from subs');
reset role;
select pg_temp.login('client');
select is((select count(*)::int from public.schedule_items), 0, 'offline schedule is hidden from clients');
reset role;

select pg_temp.login('owner');
insert into public.job_schedule_settings (job_id, org_id, is_online, online_at) values (pg_temp.id('job'), pg_temp.id('org'), true, now());
reset role;

select pg_temp.login('sub');
select is((select count(*)::int from public.schedule_items), 1, 'online: sub sees only its assigned item');
select is((select count(*)::int from public.schedule_links), 0, 'sub cannot see links to items it cannot see');
select lives_ok(format($q$select public.respond_schedule_item(%L, true)$q$, pg_temp.id('frame')), 'sub confirms');
select throws_ok(format($q$select public.respond_schedule_item(%L, true)$q$, pg_temp.id('elec')), '42501', null, 'cannot confirm an item you are not on');
update public.schedule_items set start_date = '2026-11-01' where id = pg_temp.id('frame');
reset role;
select is((select start_date::text from public.schedule_items where id = pg_temp.id('frame')), '2026-10-05', 'sub cannot move items');

select pg_temp.login('client');
select is((select count(*)::int from public.schedule_items), 1, 'client sees only items shown to the client');
reset role;

select pg_temp.login('owner');
select set_config('app.shift_reason', 'Weather', true);
update public.schedule_items set start_date = '2026-10-06', end_date = '2026-10-12' where id = pg_temp.id('frame');
select is((select reason from public.schedule_shifts where item_id = pg_temp.id('frame')), 'Weather', 'online shifts are logged with a reason');
select is((select status::text from public.schedule_assignees where item_id = pg_temp.id('frame')), 'pending', 'moving an item asks the sub to re-confirm');
reset role;

select pg_temp.login('sub');
select ok((select count(*) from public.notifications where type = 'schedule.changed') = 1, 'sub is told the item moved');
reset role;

select * from finish();
rollback;
