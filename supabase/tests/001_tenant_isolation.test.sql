-- Tenant isolation and permission tests (pgTAP).
-- Run: pnpm db:test   (supabase test db)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(48);

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

create or replace function pg_temp.id(p text) returns uuid language sql as $$ select v from ids where k = p $$;

create or replace function pg_temp.mkuser(p_key text, p_email text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '{}', now(), now());
  insert into ids values (p_key, v);
  return v;
end $$;

create or replace function pg_temp.login(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_key), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.mkuser('ownerA', 'owner@a.test');
select pg_temp.mkuser('ownerB', 'owner@b.test');
select pg_temp.mkuser('pmA',    'pm@a.test');
select pg_temp.mkuser('crewA',  'crew@a.test');
select pg_temp.mkuser('subS',   'sub@s.test');
select pg_temp.mkuser('subT',   'sub@t.test');
select pg_temp.mkuser('client', 'home@owner.test');

-- Owner A creates builder A, three jobs, a sub, a client, and invites staff
select pg_temp.login('ownerA');
insert into ids select 'orgA', public.create_builder_org('Alpha Homes');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('orgA'), 'Lot 1 Maple', 'open') returning id) insert into ids select 'job1', id from x;
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('orgA'), 'Lot 2 Oak', 'open') returning id) insert into ids select 'job2', id from x;
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('orgA'), 'Lot 3 Presale', 'presale') returning id) insert into ids select 'job3', id from x;
update public.job_private set contract_price = 650000, internal_notes = 'margin 18%' where job_id = pg_temp.id('job1');

insert into ids select 'linkS', public.add_sub_vendor(pg_temp.id('orgA'), 'Sparks Electric', 'sub@s.test', 'Electrical');
insert into ids select 'linkT', public.add_sub_vendor(pg_temp.id('orgA'), 'Tile Tech', 'sub@t.test', 'Tile');
insert into ids select 'orgS', sub_org_id from public.builder_sub_links where id = pg_temp.id('linkS');
insert into ids select 'orgT', sub_org_id from public.builder_sub_links where id = pg_temp.id('linkT');
insert into public.job_subs (job_id, sub_org_id) values (pg_temp.id('job1'), pg_temp.id('orgS'));

with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job1'), 'Home', 'home@owner.test') returning id) insert into ids select 'jc1', id from x;
select public.invite_job_client(pg_temp.id('jc1'));

select public.invite_internal_user(pg_temp.id('orgA'), 'pm@a.test',
  (select id from public.roles where org_id = pg_temp.id('orgA') and template_key = 'project_manager'));
select public.invite_internal_user(pg_temp.id('orgA'), 'crew@a.test',
  (select id from public.roles where org_id = pg_temp.id('orgA') and template_key = 'field_crew'));
reset role;

-- Tokens are only readable by the inviting builder; stash them for the test
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;

-- Accept invites
select pg_temp.login('pmA');
select public.accept_invite((select token from toks where email = 'pm@a.test'));
reset role;
select pg_temp.login('crewA');
select public.accept_invite((select token from toks where email = 'crew@a.test'));
reset role;
select pg_temp.login('subS');
select public.accept_invite((select token from toks where email = 'sub@s.test'));
reset role;
select pg_temp.login('subT');
select public.accept_invite((select token from toks where email = 'sub@t.test'));
reset role;
select pg_temp.login('client');
select public.accept_invite((select token from toks where email = 'home@owner.test'));
reset role;

-- Assign PM and crew to job1 only; crew also to job3 (presale, hidden by role)
insert into public.job_members (job_id, user_id) values
  (pg_temp.id('job1'), pg_temp.id('pmA')), (pg_temp.id('job1'), pg_temp.id('crewA')), (pg_temp.id('job3'), pg_temp.id('crewA'));

-- Owner B: separate builder
select pg_temp.login('ownerB');
insert into ids select 'orgB', public.create_builder_org('Bravo Builders');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('orgB'), 'Bravo Job') returning id) insert into ids select 'jobB', id from x;
reset role;

-- ---------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------
select is((select count(*)::int from public.roles where org_id = pg_temp.id('orgA') and is_builtin), 13, 'new builder gets 13 built-in roles');
select ok((select count(*) from public.cost_codes where org_id = pg_temp.id('orgA')) > 20, 'new builder gets starter cost codes');
select is((select count(*)::int from public.roles where is_template), 13, 'exactly 13 role templates');

-- ---------------------------------------------------------------------
-- Builder isolation
-- ---------------------------------------------------------------------
select pg_temp.login('ownerB');
select is((select count(*)::int from public.jobs where org_id = pg_temp.id('orgA')), 0, 'builder B sees none of builder A''s jobs');
select is((select count(*)::int from public.organizations where id = pg_temp.id('orgA')), 0, 'builder B cannot see builder A org');
select is((select count(*)::int from public.cost_codes where org_id = pg_temp.id('orgA')), 0, 'builder B cannot see A''s cost codes');
select is((select count(*)::int from public.job_private where job_id = pg_temp.id('job1')), 0, 'builder B cannot see A''s contract price');
select is((select count(*)::int from public.org_members where org_id = pg_temp.id('orgA')), 0, 'builder B cannot list A''s users');
select is((select count(*)::int from public.roles where org_id = pg_temp.id('orgA')), 0, 'builder B cannot see A''s roles');
select throws_ok(
  format($q$insert into public.jobs (org_id, title) values (%L, 'sneaky')$q$, pg_temp.id('orgA')),
  '42501', null, 'builder B cannot create a job in builder A');
select is((select count(*)::int from public.jobs), 1, 'builder B sees only its own job');
reset role;

-- ---------------------------------------------------------------------
-- Owner A
-- ---------------------------------------------------------------------
select pg_temp.login('ownerA');
select is((select count(*)::int from public.jobs), 3, 'owner sees all 3 of its jobs');
select is((select contract_price from public.job_private where job_id = pg_temp.id('job1')), 650000::numeric(14,2), 'owner sees contract price');
select ok((select count(*) from public.audit_log where org_id = pg_temp.id('orgA')) > 0, 'owner can read the audit log');
update public.roles set name = 'Boss' where org_id = pg_temp.id('orgA') and template_key = 'admin';
select is((select name from public.roles where org_id = pg_temp.id('orgA') and template_key = 'admin'), 'Admin',
  'built-in roles cannot be edited');
insert into ids select 'custom', public.clone_role(
  (select id from public.roles where org_id = pg_temp.id('orgA') and template_key = 'project_manager'), 'Site Super');
select is((select count(*)::int from public.role_permissions where role_id = pg_temp.id('custom')),
          (select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
             where r.org_id = pg_temp.id('orgA') and r.template_key = 'project_manager'),
          'clone_role copies every permission');
select lives_ok(
  format($q$update public.role_permissions set can_delete = false where role_id = %L and module = 'rfis'$q$, pg_temp.id('custom')),
  'custom roles are editable');
reset role;

-- ---------------------------------------------------------------------
-- Project manager (assigned jobs, statuses open/warranty/closed)
-- ---------------------------------------------------------------------
select pg_temp.login('pmA');
select is((select count(*)::int from public.jobs), 1, 'PM sees only assigned job');
select is((select id from public.jobs), pg_temp.id('job1'), 'PM sees job1');
select is((select count(*)::int from public.job_private), 1, 'PM can see price on assigned job');
select throws_ok(
  format($q$select public.clone_role(%L, 'x')$q$, (select id from public.roles where org_id = pg_temp.id('orgA') and template_key = 'admin')),
  '42501', null, 'PM cannot create roles');
select throws_ok(
  format($q$insert into public.org_members (org_id, user_id, role_id) values (%L, %L, %L)$q$,
    pg_temp.id('orgA'), pg_temp.id('ownerB'), (select id from public.roles where org_id = pg_temp.id('orgA') and template_key = 'admin')),
  '42501', null, 'PM cannot add users');
select is((select count(*)::int from public.audit_log), 0, 'PM cannot read the audit log');
update public.jobs set title = 'Lot 2 hacked' where id = pg_temp.id('job2');
reset role;
select is((select title from public.jobs where id = pg_temp.id('job2')), 'Lot 2 Oak', 'PM cannot edit a job they are not on');

-- ---------------------------------------------------------------------
-- Field crew (no pricing, open/warranty only)
-- ---------------------------------------------------------------------
select pg_temp.login('crewA');
select is((select count(*)::int from public.jobs), 1, 'crew sees job1 but not the presale job they are on');
select is((select count(*)::int from public.job_private), 0, 'crew cannot see contract price');
select throws_ok(
  format($q$insert into public.jobs (org_id, title) values (%L, 'crew job')$q$, pg_temp.id('orgA')),
  '42501', null, 'crew cannot create jobs');
update public.jobs set title = 'crew edit' where id = pg_temp.id('job1');
reset role;
select is((select title from public.jobs where id = pg_temp.id('job1')), 'Lot 1 Maple', 'crew cannot edit jobs (no edit permission)');

-- ---------------------------------------------------------------------
-- Sub on job1
-- ---------------------------------------------------------------------
select pg_temp.login('subS');
select is((select count(*)::int from public.jobs), 1, 'sub sees only the job it is on');
select is((select id from public.jobs), pg_temp.id('job1'), 'sub sees job1');
select is((select count(*)::int from public.job_private), 0, 'sub cannot see contract price or internal notes');
select is((select name from public.organizations where id = pg_temp.id('orgA')), 'Alpha Homes', 'sub can see its builder''s name');
select is((select count(*)::int from public.cost_codes where org_id = pg_temp.id('orgA')) > 0, true, 'linked sub can read builder cost codes');
select is((select count(*)::int from public.job_clients), 0, 'sub cannot see client contacts by default');
select is((select count(*)::int from public.org_members where org_id = pg_temp.id('orgA')), 0, 'sub cannot list builder staff memberships');
select lives_ok(
  format($q$select public.update_my_sub_profile(%L, '{"business_phone":"780-555-0101"}')$q$, pg_temp.id('linkS')),
  'sub admin can edit its per-builder profile');
select throws_ok(
  format($q$select public.update_my_sub_profile(%L, '{"business_phone":"x"}')$q$, pg_temp.id('linkT')),
  '42501', null, 'sub cannot edit another sub''s profile');
update public.builder_sub_links set status = 'inactive' where id = pg_temp.id('linkS');
update public.jobs set title = 'sub edit' where id = pg_temp.id('job1');
reset role;
select is((select status::text from public.builder_sub_links where id = pg_temp.id('linkS')), 'active', 'sub cannot change its own link status');
select is((select title from public.jobs where id = pg_temp.id('job1')), 'Lot 1 Maple', 'sub cannot edit jobs');
select is((select business_phone from public.builder_sub_links where id = pg_temp.id('linkS')), '780-555-0101', 'profile edit saved');

-- Sub not on the job
select pg_temp.login('subT');
select is((select count(*)::int from public.jobs), 0, 'linked sub with no jobs sees no jobs');
reset role;

-- Deactivated link cuts access
update public.builder_sub_links set status = 'inactive' where id = pg_temp.id('linkS');
select pg_temp.login('subS');
select is((select count(*)::int from public.jobs), 0, 'inactive link removes job access');
reset role;
update public.builder_sub_links set status = 'active' where id = pg_temp.id('linkS');

-- ---------------------------------------------------------------------
-- Client
-- ---------------------------------------------------------------------
select pg_temp.login('client');
select is((select count(*)::int from public.jobs), 1, 'client sees only their job');
select is((select count(*)::int from public.job_private), 0, 'client cannot see internal notes');
select is((select count(*)::int from public.job_clients), 1, 'client sees their own contact record');
select is((select count(*)::int from public.cost_codes), 0, 'client cannot see cost codes');
reset role;

-- ---------------------------------------------------------------------
-- Invites and job selection
-- ---------------------------------------------------------------------
select pg_temp.login('ownerA');
select public.invite_internal_user(pg_temp.id('orgA'), 'someone@else.test',
  (select id from public.roles where org_id = pg_temp.id('orgA') and template_key = 'field_crew'));
reset role;
insert into toks select email::text, token from public.invites where email = 'someone@else.test';
select pg_temp.login('ownerB');
select throws_ok(
  format($q$select public.accept_invite(%L)$q$, (select token from toks where email = 'someone@else.test')),
  '42501', null, 'invite cannot be accepted by a different email');
reset role;

select pg_temp.login('pmA');
select public.set_job_selection(pg_temp.id('orgA'), false, array[pg_temp.id('job1'), pg_temp.id('job2'), pg_temp.id('jobB')]);
select is((select job_ids from public.user_job_selection where user_id = pg_temp.id('pmA')), array[pg_temp.id('job1')],
  'job selection drops jobs the user cannot see');
reset role;

select * from finish();
rollback;
