begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);

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

select pg_temp.mkuser('owner', 'o@r.test'); select pg_temp.mkuser('sub', 's@r.test'); select pg_temp.mkuser('sub2', 's2@r.test');
select pg_temp.mkuser('client', 'h@r.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('RFI Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'J1') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Sub One', 's@r.test');
insert into ids select 'l2', public.add_sub_vendor(pg_temp.id('org'), 'Sub Two', 's2@r.test');
insert into ids select 'so1', sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
insert into ids select 'so2', sub_org_id from public.builder_sub_links where id = pg_temp.id('l2');
insert into public.job_subs (job_id, sub_org_id) values (pg_temp.id('job'), pg_temp.id('so1')), (pg_temp.id('job'), pg_temp.id('so2'));
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'H', 'h@r.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
with x as (insert into public.rfis (org_id, job_id, title, question, due_date, assignee_sub_org_id) values (pg_temp.id('org'), pg_temp.id('job'), 'Panel location?', 'Where does the panel go?', current_date + 3, pg_temp.id('so1')) returning id) insert into ids select 'r1', id from x;
with x as (insert into public.rfis (org_id, job_id, title, question, due_date) values (pg_temp.id('org'), pg_temp.id('job'), 'Internal', 'Internal q', current_date + 3) returning id) insert into ids select 'r2', id from x;
select is((select number from public.rfis where id = pg_temp.id('r2')), 2, 'RFIs are numbered per job');
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@r.test')); reset role;
select pg_temp.login('sub2'); select public.accept_invite((select token from toks where email = 's2@r.test')); reset role;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'h@r.test')); reset role;

select pg_temp.login('sub');
select is((select count(*)::int from public.rfis), 0, 'sub does not see unsent RFIs');
reset role;
select pg_temp.login('owner');
select public.set_rfi_status(pg_temp.id('r1'), 'send');
select public.set_rfi_status(pg_temp.id('r2'), 'send');
update public.rfis set status = 'completed' where id = pg_temp.id('r2');
select is((select status::text from public.rfis where id = pg_temp.id('r2')), 'sent', 'status cannot be set directly');
reset role;

select pg_temp.login('sub');
select is((select count(*)::int from public.rfis), 1, 'sub sees only the RFI assigned to its company');
select lives_ok(format($q$insert into public.rfi_responses (rfi_id, body) values (%L, 'Beside the garage door')$q$, pg_temp.id('r1')), 'assigned sub can respond');
select throws_ok(format($q$insert into public.rfi_responses (rfi_id, body) values (%L, 'sneaky')$q$, pg_temp.id('r2')), '42501', null, 'sub cannot respond to an RFI it cannot see');
select lives_ok(format($q$select public.set_rfi_status(%L, 'complete')$q$, pg_temp.id('r1')), 'assignee can mark complete');
select throws_ok(format($q$select public.set_rfi_status(%L, 'reopen')$q$, pg_temp.id('r1')), '42501', null, 'assignee sub cannot reopen');
-- Sub raises its own RFI to the builder
with x as (insert into public.rfis (org_id, job_id, title, question, due_date) values (pg_temp.id('org'), pg_temp.id('job'), 'Sub question', 'Which fixture?', current_date + 2) returning id) insert into ids select 'r3', id from x;
select is((select author_type from public.rfis where id = pg_temp.id('r3')), 'sub', 'sub-authored RFI');
select throws_ok(format($q$insert into public.rfis (org_id, job_id, title, question, due_date, assignee_sub_org_id) values (%L, %L, 'x', 'y', current_date, %L)$q$, pg_temp.id('org'), pg_temp.id('job'), pg_temp.id('so2')),
  '42501', null, 'sub cannot assign an RFI to another sub without permission');
select public.set_rfi_status(pg_temp.id('r3'), 'send');
reset role;

select pg_temp.login('sub2');
select is((select count(*)::int from public.rfis), 0, 'other sub sees neither RFI');
reset role;
select pg_temp.login('client');
select is((select count(*)::int from public.rfis), 0, 'clients never see RFIs');
reset role;
select pg_temp.login('owner');
select is((select count(*)::int from public.rfis), 3, 'builder sees all sent RFIs including the sub''s');
select lives_ok(format($q$select public.set_rfi_status(%L, 'reopen')$q$, pg_temp.id('r1')), 'builder can reopen');
reset role;

select * from finish();
rollback;
