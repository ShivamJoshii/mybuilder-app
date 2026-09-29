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

select pg_temp.mkuser('owner', 'o@cf.test'); select pg_temp.mkuser('sub', 's@cf.test'); select pg_temp.mkuser('client', 'c@cf.test'); select pg_temp.mkuser('ownerB', 'b@cf.test');

select pg_temp.login('ownerB');
insert into ids select 'orgB', public.create_builder_org('Other');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('orgB'), 'B', 'open') returning id) insert into ids select 'jobB', id from x;
reset role;

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Field Co');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('org'), 'House', 'open') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Sub', 's@cf.test');
insert into public.job_subs (job_id, sub_org_id) select pg_temp.id('job'), sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'C', 'c@cf.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
with x as (insert into public.custom_field_defs (org_id, module, key, label, data_type) values (pg_temp.id('org'), 'jobs', 'permit_ref', 'Permit ref', 'text') returning id) insert into ids select 'd_permit', id from x;
with x as (insert into public.custom_field_defs (org_id, module, key, label, data_type, options, visible_to_clients) values (pg_temp.id('org'), 'jobs', 'siding', 'Siding colour', 'single_select', '["Grey","White"]', true) returning id) insert into ids select 'd_siding', id from x;
with x as (insert into public.custom_field_defs (org_id, module, key, label, data_type, visible_to_subs) values (pg_temp.id('org'), 'daily_logs', 'crew', 'Crew size', 'number', true) returning id) insert into ids select 'd_crew', id from x;
with x as (insert into public.daily_logs (org_id, job_id, notes, status) values (pg_temp.id('org'), pg_temp.id('job'), 'internal', 'published') returning id) insert into ids select 'log_int', id from x;
with x as (insert into public.daily_logs (org_id, job_id, notes, status, share_subs) values (pg_temp.id('org'), pg_temp.id('job'), 'shared', 'published', true) returning id) insert into ids select 'log_sub', id from x;
insert into public.custom_field_values (def_id, record_id, value) values
  (pg_temp.id('d_permit'), pg_temp.id('job'), '"BP-2026-114"'), (pg_temp.id('d_siding'), pg_temp.id('job'), '"Grey"'),
  (pg_temp.id('d_crew'), pg_temp.id('log_int'), '4'), (pg_temp.id('d_crew'), pg_temp.id('log_sub'), '6');
select is((select org_id from public.custom_field_values where def_id = pg_temp.id('d_permit')), pg_temp.id('org'), 'values take the record''s company');
select throws_ok(format($q$update public.custom_field_values set value = '"Purple"' where def_id = %L$q$, pg_temp.id('d_siding')), '22023', null, 'select values must be one of the options');
select throws_ok(format($q$insert into public.custom_field_values (def_id, record_id, value) values (%L, %L, '"x"')$q$, pg_temp.id('d_permit'), pg_temp.id('jobB')), '23514', null, 'a field cannot be set on another company''s record');
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@cf.test')); reset role;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'c@cf.test')); reset role;

select pg_temp.login('client');
select is((select array_agg(value #>> '{}')::text from public.custom_field_values), '{Grey}', 'clients see only client-visible fields');
reset role;
select pg_temp.login('sub');
select is((select array_agg(value::text)::text from public.custom_field_values), '{6}', 'subs see sub-visible fields on records shared with them');
select throws_ok(format($q$insert into public.custom_field_values (def_id, record_id, value) values (%L, %L, '"x"')$q$, pg_temp.id('d_permit'), pg_temp.id('job')), '42501', null, 'subs cannot write values');
update public.custom_field_values set value = '99' where def_id = pg_temp.id('d_crew');
reset role;
select is((select value::text from public.custom_field_values where record_id = pg_temp.id('log_sub')), '6', 'subs cannot change values');
select pg_temp.login('ownerB');
select is((select count(*)::int from public.custom_field_values), 0, 'other companies see nothing');
reset role;
select pg_temp.login('owner');
select is((select count(*)::int from public.custom_field_values), 4, 'the team sees every value');
reset role;

select * from finish();
rollback;
