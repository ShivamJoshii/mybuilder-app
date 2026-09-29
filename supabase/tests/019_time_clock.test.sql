begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);

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


select pg_temp.mkuser('owner', 'o@t.test'); select pg_temp.mkuser('crew', 'c@t.test'); select pg_temp.mkuser('crew2', 'c2@t.test');
select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Time Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'J') returning id) insert into ids select 'job', id from x;
select public.invite_internal_user(pg_temp.id('org'), 'c@t.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'field_crew'));
select public.invite_internal_user(pg_temp.id('org'), 'c2@t.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'field_crew'));
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('crew'); select public.accept_invite((select token from toks where email = 'c@t.test')); reset role;
select pg_temp.login('crew2'); select public.accept_invite((select token from toks where email = 'c2@t.test')); reset role;
select pg_temp.login('owner');
insert into public.job_members (job_id, user_id) values (pg_temp.id('job'), pg_temp.id('crew')), (pg_temp.id('job'), pg_temp.id('crew2'));
insert into public.labor_rates (org_id, user_id, hourly_cost) values (pg_temp.id('org'), pg_temp.id('crew'), 40);
reset role;

select pg_temp.login('crew');
select lives_ok(format('select public.clock_in(%L)', pg_temp.id('job')), 'crew clocks in');
select throws_ok(format('select public.clock_in(%L)', pg_temp.id('job')), '23505', null, 'one open shift at a time');
select is((select count(*)::int from public.labor_rates), 1, 'you can see your own rate');
reset role;
-- pretend the shift ran 8.5 hours
update public.time_shifts set clock_in = now() - interval '8 hours 30 minutes' where user_id = pg_temp.id('crew');
select pg_temp.login('crew');
select public.clock_out(30, 'Framing');
select is((select public.shift_hours(s) from public.time_shifts s where user_id = pg_temp.id('crew')), 8.00::numeric, 'hours = elapsed − break');
select is(public.review_shifts(array(select id from public.time_shifts where user_id = pg_temp.id('crew')), true), 0, 'crew cannot approve (own or at all)');
reset role;
select pg_temp.login('crew2');
select is((select count(*)::int from public.time_shifts), 0, 'crew cannot see other people''s shifts');
select is((select count(*)::int from public.labor_rates), 0, 'crew cannot see other people''s rates');
reset role;
select pg_temp.login('owner');
select is(public.review_shifts(array(select id from public.time_shifts where user_id = pg_temp.id('crew')), true), 1, 'owner approves');
select is((select sum(actual) from public.job_budget(pg_temp.id('job'))), 320.00::numeric, 'approved labour hits the budget at the rate');
select throws_ok(format($q$update public.time_shifts set break_minutes = 0 where user_id = %L$q$, pg_temp.id('crew')), '55000', null, 'approved shifts are locked');
reset role;
select * from finish();
rollback;
