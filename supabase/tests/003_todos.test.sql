begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(13);

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

select pg_temp.mkuser('owner', 'o@t.test'); select pg_temp.mkuser('crew', 'c@t.test'); select pg_temp.mkuser('sales', 'r@t.test');
select pg_temp.mkuser('sub', 's@t.test'); select pg_temp.mkuser('sub2', 's2@t.test'); select pg_temp.mkuser('client', 'h@t.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Todo Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'J1') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Sub One', 's@t.test');
insert into ids select 'l2', public.add_sub_vendor(pg_temp.id('org'), 'Sub Two', 's2@t.test');
insert into ids select 'so1', sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
insert into ids select 'so2', sub_org_id from public.builder_sub_links where id = pg_temp.id('l2');
insert into public.job_subs (job_id, sub_org_id) values (pg_temp.id('job'), pg_temp.id('so1')), (pg_temp.id('job'), pg_temp.id('so2'));
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'H', 'h@t.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
select public.invite_internal_user(pg_temp.id('org'), 'c@t.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'field_crew'));
select public.invite_internal_user(pg_temp.id('org'), 'r@t.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'sales_rep'));
with x as (insert into public.todos (org_id, job_id, title) values (pg_temp.id('org'), pg_temp.id('job'), 'Rough-in electrical') returning id) insert into ids select 't_sub', id from x;
with x as (insert into public.todos (org_id, job_id, title) values (pg_temp.id('org'), pg_temp.id('job'), 'Order trusses') returning id) insert into ids select 't_int', id from x;
insert into public.todo_assignees (todo_id, sub_org_id) values (pg_temp.id('t_sub'), pg_temp.id('so1'));
insert into public.todo_checklist (todo_id, body) values (pg_temp.id('t_sub'), 'Panel mounted');
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('crew'); select public.accept_invite((select token from toks where email = 'c@t.test')); reset role;
select pg_temp.login('sales'); select public.accept_invite((select token from toks where email = 'r@t.test')); reset role;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@t.test')); reset role;
select pg_temp.login('sub2'); select public.accept_invite((select token from toks where email = 's2@t.test')); reset role;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'h@t.test')); reset role;
insert into public.job_members (job_id, user_id) values (pg_temp.id('job'), pg_temp.id('crew')), (pg_temp.id('job'), pg_temp.id('sales'));

select pg_temp.login('owner');
select is((select count(*)::int from public.todos), 2, 'owner sees both to-dos');
reset role;

select pg_temp.login('crew');
select is((select count(*)::int from public.todos), 2, 'field crew on the job sees the job''s to-dos');
reset role;

select pg_temp.login('sales');
select is((select count(*)::int from public.todos), 0, 'sales rep without to-do permission sees none');
reset role;

select pg_temp.login('sub');
select is((select count(*)::int from public.todos), 1, 'sub sees only the to-do assigned to its company');
select is((select count(*)::int from public.todo_checklist), 1, 'sub sees the checklist of its to-do');
select throws_ok(format($q$select public.set_todo_complete(%L, true)$q$, pg_temp.id('t_sub')), '23514', null, 'cannot complete with open checklist items');
select lives_ok(format($q$select public.set_checklist_item(%L, true)$q$, (select id from public.todo_checklist limit 1)), 'assignee ticks a checklist item');
select lives_ok(format($q$select public.set_todo_complete(%L, true)$q$, pg_temp.id('t_sub')), 'assignee completes the to-do');
update public.todos set title = 'renamed' where id = pg_temp.id('t_sub');
select throws_ok(format($q$insert into public.todos (org_id, job_id, title) values (%L, %L, 'x')$q$, pg_temp.id('org'), pg_temp.id('job')), '42501', null, 'sub cannot create builder to-dos');
reset role;
select is((select title from public.todos where id = pg_temp.id('t_sub')), 'Rough-in electrical', 'sub cannot rename a to-do');
select ok((select completed_at is not null from public.todos where id = pg_temp.id('t_sub')), 'completion saved');

select pg_temp.login('sub2');
select is((select count(*)::int from public.todos), 0, 'another sub on the same job does not see it');
reset role;

select pg_temp.login('client');
select is((select count(*)::int from public.todos), 0, 'client sees no to-dos unless assigned');
reset role;

select * from finish();
rollback;
