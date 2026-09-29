begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);

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


select pg_temp.mkuser('owner', 'o@pl.test'); select pg_temp.mkuser('client', 'c@pl.test');
select pg_temp.mkuser('sub', 's@pl.test'); select pg_temp.mkuser('other', 'x@pl.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Plan Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'House') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Framer', 's@pl.test');
insert into public.job_subs (job_id, sub_org_id) select pg_temp.id('job'), sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'C', 'c@pl.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
with x as (insert into public.plan_sheets (org_id, job_id, number, title) values (pg_temp.id('org'), pg_temp.id('job'), 'A-101', 'Floor plan') returning id) insert into ids select 'sh', id from x;
insert into public.plan_sheet_versions (sheet_id, version, storage_key, status) values (pg_temp.id('sh'), 1, 'k/1', 'ready');
with x as (insert into public.spec_documents (org_id, job_id, title, body, share_clients) values (pg_temp.id('org'), pg_temp.id('job'), 'Finishes', 'Paint: eggshell', true) returning id) insert into ids select 'spec', id from x;
insert into public.plan_markups (sheet_id, version, visibility, shapes) values (pg_temp.id('sh'), 1, 'team', '[{"t":"rect"}]');
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'c@pl.test')); reset role;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@pl.test')); reset role;

select pg_temp.login('sub');
select is((select count(*)::int from public.plan_sheets), 0, 'unshared sheets are hidden from subs');
reset role;
select pg_temp.login('owner');
update public.plan_sheets set share_subs = true where id = pg_temp.id('sh');
reset role;
select is((select count(*)::int from public.notifications where type = 'plans.published' and user_id = pg_temp.id('sub')), 1, 'sub is notified when a sheet is shared');
select pg_temp.login('sub');
select is((select count(*)::int from public.plan_sheets), 1, 'shared sheet is visible to the sub');
select is((select count(*)::int from public.plan_sheet_versions), 1, 'sub can read the sheet versions');
select is((select count(*)::int from public.plan_markups), 0, 'team markups are hidden from subs');
insert into public.plan_markups (sheet_id, version, visibility, shapes) values (pg_temp.id('sh'), 1, 'private', '[{"t":"pen"}]');
select throws_ok(format($q$insert into public.plan_sheets (org_id, job_id, number) values (%L, %L, 'X')$q$, pg_temp.id('org'), pg_temp.id('job')), '42501', null, 'subs cannot add sheets');
reset role;
select pg_temp.login('owner');
select is((select count(*)::int from public.plan_markups), 1, 'private markups stay with their author');
reset role;

select pg_temp.login('client');
select is((select count(*)::int from public.plan_sheets), 0, 'client does not see sub-only sheets');
select is((select count(*)::int from public.spec_documents), 1, 'client sees specs shared with clients');
reset role;
select pg_temp.login('other');
select is((select count(*)::int from public.plan_sheets) + (select count(*)::int from public.spec_documents), 0, 'outsider sees nothing');
reset role;
select pg_temp.login('owner');
update public.plan_sheets set current_version = 2 where id = pg_temp.id('sh');
reset role;
select is((select count(*)::int from public.notifications where type = 'plans.published' and user_id = pg_temp.id('sub')), 2, 'new version notifies again');
select is((select count(*)::int from public.notifications where type = 'plans.published' and user_id = pg_temp.id('client')), 0, 'clients are not notified about sub-only sheets');

select * from finish();
rollback;
