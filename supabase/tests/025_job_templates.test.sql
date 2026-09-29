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

select pg_temp.mkuser('owner', 'o@tp.test'); select pg_temp.mkuser('ownerB', 'b@tp.test');

select pg_temp.login('ownerB');
insert into ids select 'orgB', public.create_builder_org('Other');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('orgB'), 'B', 'open') returning id) insert into ids select 'jobB', id from x;
reset role;

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Template Co');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('org'), 'Show home', 'open') returning id) insert into ids select 'src', id from x;
with x as (insert into public.schedule_items (org_id, job_id, title, start_date, duration, end_date) values (pg_temp.id('org'), pg_temp.id('src'), 'Foundation', '2026-03-02', 5, '2026-03-06') returning id) insert into ids select 'i1', id from x;
with x as (insert into public.schedule_items (org_id, job_id, title, start_date, duration, end_date) values (pg_temp.id('org'), pg_temp.id('src'), 'Framing', '2026-03-09', 10, '2026-03-20') returning id) insert into ids select 'i2', id from x;
insert into public.schedule_links (predecessor_id, successor_id) values (pg_temp.id('i1'), pg_temp.id('i2'));
insert into public.schedule_assignees (item_id, user_id) values (pg_temp.id('i2'), pg_temp.id('owner'));
with x as (insert into public.todos (org_id, job_id, title, due_at) values (pg_temp.id('org'), pg_temp.id('src'), 'Order trusses', '2026-03-05 16:00-07') returning id) insert into ids select 't1', id from x;
insert into public.todo_checklist (todo_id, body, sort) values (pg_temp.id('t1'), 'Get engineering', 1);
with x as (insert into public.selections (org_id, job_id, title, allowance, schedule_item_id, days_before) values (pg_temp.id('org'), pg_temp.id('src'), 'Siding', 5000, pg_temp.id('i2'), 14) returning id) insert into ids select 's1', id from x;
with x as (insert into public.selection_choices (selection_id, title, client_price) values (pg_temp.id('s1'), 'Vinyl', 4500) returning id) insert into ids select 'c1', id from x;
insert into public.selection_choice_costs (choice_id, builder_cost) values (pg_temp.id('c1'), 3000);
insert into public.spec_documents (org_id, job_id, title, body) values (pg_temp.id('org'), pg_temp.id('src'), 'Finishes', 'Eggshell');
with x as (insert into public.estimates (job_id, tax_rate, tax_label) values (pg_temp.id('src'), 5, 'GST') returning id) insert into ids select 'est', id from x;
insert into public.estimate_items (estimate_id, title, quantity, unit, unit_cost) values (pg_temp.id('est'), 'Concrete', 10, 'm3', 250);

-- Save as template
insert into ids select 'tpl', public.save_as_template(pg_temp.id('src'), 'Bungalow');
select is((select is_template::text || ':' || title from public.jobs where id = pg_temp.id('tpl')), 'true:Bungalow', 'a template job is created');
select is((select count(*)::int from public.schedule_items where job_id = pg_temp.id('tpl')), 2, 'schedule is copied');
select is((select count(*)::int from public.schedule_links l join public.schedule_items i on i.id = l.successor_id where i.job_id = pg_temp.id('tpl')), 1, 'dependencies are copied');
select throws_ok(format($q$insert into public.job_clients (job_id, first_name) values (%L, 'X')$q$, pg_temp.id('tpl')), '23514', null, 'templates cannot have clients');
update public.jobs set is_template = false where id = pg_temp.id('tpl');
select is((select is_template from public.jobs where id = pg_temp.id('tpl')), true, 'a template stays a template');

-- New job from the template, starting 2026-10-05 (a Monday, 217 days later)
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('org'), 'Lot 9', 'open') returning id) insert into ids select 'new', id from x;
select public.copy_job_content(pg_temp.id('tpl'), pg_temp.id('new'), '2026-10-05', array['schedule', 'todos', 'selections', 'specs', 'estimate']);
select is((select string_agg(title || '@' || start_date, ',' order by start_date) from public.schedule_items where job_id = pg_temp.id('new')),
  'Foundation@2026-10-05,Framing@2026-10-12', 'dates move to the new start');
select is((select (due_at at time zone 'America/Edmonton')::date from public.todos where job_id = pg_temp.id('new')), '2026-10-08'::date, 'to-do due dates move too');
select is((select count(*)::int from public.todo_checklist c join public.todos t on t.id = c.todo_id where t.job_id = pg_temp.id('new')), 1, 'checklists come along');
select is((select deadline from public.selections where job_id = pg_temp.id('new')), '2026-09-28'::date, 'selection deadline follows the copied schedule item');
select is((select k.builder_cost from public.selection_choice_costs k join public.selection_choices c on c.id = k.choice_id join public.selections s on s.id = c.selection_id where s.job_id = pg_temp.id('new')),
  3000.00::numeric, 'choices keep their builder cost');
select is((select count(*)::int from public.estimate_items i join public.estimates e on e.id = i.estimate_id where e.job_id = pg_temp.id('new')), 1, 'estimate lines are copied');
select is((select count(*)::int from public.notifications), 0, 'nobody is notified about copied items');
select throws_ok(format($q$select public.copy_job_content(%L, %L, null, array['schedule'])$q$, pg_temp.id('tpl'), pg_temp.id('jobB')), '42501', null, 'cannot copy into another company''s job');
reset role;

select * from finish();
rollback;
