begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(5);

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

select pg_temp.mkuser('owner', 'o@au.test'); select pg_temp.mkuser('pm', 'pm@au.test');
select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Audit Co');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('org'), 'House', 'open') returning id) insert into ids select 'job', id from x;
with x as (insert into public.bills (org_id, job_id, vendor_name, number, title) values (pg_temp.id('org'), pg_temp.id('job'), 'Home Depot', 0, 'Lumber') returning id) insert into ids select 'bill', id from x;
update public.bills set title = 'Lumber (framing)' where id = pg_temp.id('bill');
update public.bills set title = 'Lumber (framing)' where id = pg_temp.id('bill');
update public.organizations set timezone = 'America/Toronto' where id = pg_temp.id('org');
select is((select count(*)::int from public.audit_log where table_name = 'bills'), 2, 'bill insert and real edit are logged, the no-op is not');
select is((select after ->> 'title' from public.audit_log where table_name = 'bills' and action = 'update'), 'Lumber (framing)', 'the log keeps the new values');
select is((select actor_id from public.audit_log where table_name = 'bills' and action = 'update'), pg_temp.id('owner'), 'and who did it');
select is((select count(*)::int from public.audit_log where table_name = 'organizations' and org_id = pg_temp.id('org')), 1, 'company settings changes are logged');
select public.invite_internal_user(pg_temp.id('org'), 'pm@au.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'project_manager'));
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('pm'); select public.accept_invite((select token from toks where email = 'pm@au.test'));
select is((select count(*)::int from public.audit_log), 0, 'people without the audit permission see nothing');
reset role;

select * from finish();
rollback;
