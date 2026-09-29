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

select pg_temp.mkuser('owner', 'o@d.test'); select pg_temp.mkuser('crew', 'c@d.test');
select pg_temp.mkuser('sub', 's@d.test'); select pg_temp.mkuser('sub2', 's2@d.test'); select pg_temp.mkuser('client', 'h@d.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Log Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'J1') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Sub One', 's@d.test');
insert into ids select 'l2', public.add_sub_vendor(pg_temp.id('org'), 'Sub Two', 's2@d.test');
insert into public.job_subs (job_id, sub_org_id) select pg_temp.id('job'), sub_org_id from public.builder_sub_links where id in (pg_temp.id('l1'), pg_temp.id('l2'));
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'H', 'h@d.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
select public.invite_internal_user(pg_temp.id('org'), 'c@d.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'field_crew'));
with x as (insert into public.daily_logs (org_id, job_id, notes, status) values (pg_temp.id('org'), pg_temp.id('job'), 'internal only', 'published') returning id) insert into ids select 'log_int', id from x;
with x as (insert into public.daily_logs (org_id, job_id, notes, status, share_subs) values (pg_temp.id('org'), pg_temp.id('job'), 'for subs', 'published', true) returning id) insert into ids select 'log_subs', id from x;
with x as (insert into public.daily_logs (org_id, job_id, notes, status, share_clients) values (pg_temp.id('org'), pg_temp.id('job'), 'for client', 'published', true) returning id) insert into ids select 'log_client', id from x;
with x as (insert into public.daily_logs (org_id, job_id, notes, status) values (pg_temp.id('org'), pg_temp.id('job'), 'owner draft', 'draft') returning id) insert into ids select 'log_draft', id from x;
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('crew'); select public.accept_invite((select token from toks where email = 'c@d.test')); reset role;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@d.test')); reset role;
select pg_temp.login('sub2'); select public.accept_invite((select token from toks where email = 's2@d.test')); reset role;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'h@d.test')); reset role;
insert into public.job_members (job_id, user_id) values (pg_temp.id('job'), pg_temp.id('crew'));

select pg_temp.login('owner');
select is((select count(*)::int from public.daily_logs), 4, 'owner sees all own logs incl. draft');
reset role;
select pg_temp.login('crew');
select is((select count(*)::int from public.daily_logs), 3, 'crew sees published internal logs, not the owner draft');
reset role;
select pg_temp.login('sub');
select is((select count(*)::int from public.daily_logs), 1, 'sub sees only logs shared with subs');
with x as (insert into public.daily_logs (org_id, job_id, notes, status) values (pg_temp.id('org'), pg_temp.id('job'), 'sub log', 'published') returning id) insert into ids select 'log_sub', id from x;
select is((select author_type from public.daily_logs where id = pg_temp.id('log_sub')), 'sub', 'sub-authored log marked as sub');
update public.daily_logs set notes = 'edited by sub' where id = pg_temp.id('log_subs');
reset role;
select is((select notes from public.daily_logs where id = pg_temp.id('log_subs')), 'for subs', 'sub cannot edit the builder''s log');
select pg_temp.login('owner');
select is((select count(*)::int from public.daily_logs where id = pg_temp.id('log_sub')), 1, 'builder sees the sub''s log');
reset role;
select pg_temp.login('sub2');
select is((select count(*)::int from public.daily_logs), 1, 'other sub sees builder-shared log but not sub one''s log');
reset role;
select pg_temp.login('client');
select is((select count(*)::int from public.daily_logs), 1, 'client sees only client-shared logs');
select throws_ok(format($q$insert into public.daily_logs (org_id, job_id, notes) values (%L, %L, 'x')$q$, pg_temp.id('org'), pg_temp.id('job')), '42501', null, 'client cannot write logs');
reset role;
select pg_temp.login('owner');
select throws_ok(format($q$insert into public.daily_logs (org_id, job_id, notes, log_date) values (%L, %L, 'future', current_date + 5)$q$, pg_temp.id('org'), pg_temp.id('job')), '23514', null, 'no future-dated logs');
select throws_ok(format($q$insert into public.daily_logs (org_id, job_id, notes, title) values (%L, %L, 'x', repeat('a', 51))$q$, pg_temp.id('org'), pg_temp.id('job')), '23514', null, 'title max 50 characters');
reset role;

select * from finish();
rollback;
