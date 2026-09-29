begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(17);

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


select pg_temp.mkuser('owner', 'o@sel.test'); select pg_temp.mkuser('client', 'c@sel.test');
select pg_temp.mkuser('sub', 's@sel.test'); select pg_temp.mkuser('other', 'x@sel.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Sel Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'House') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Tile Co', 's@sel.test');
insert into public.job_subs (job_id, sub_org_id) select pg_temp.id('job'), sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'C', 'c@sel.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
with x as (insert into public.schedule_items (org_id, job_id, title, start_date, duration, end_date) values (pg_temp.id('org'), pg_temp.id('job'), 'Tile install', '2026-11-20', 2, '2026-11-23') returning id) insert into ids select 'si', id from x;
with x as (insert into public.selections (org_id, job_id, title, allowance, share_subs, schedule_item_id, days_before) values (pg_temp.id('org'), pg_temp.id('job'), 'Kitchen backsplash', 1000, true, pg_temp.id('si'), 14) returning id) insert into ids select 'sel', id from x;
select is((select deadline from public.selections where id = pg_temp.id('sel')), '2026-11-06'::date, 'deadline follows the linked schedule item');
update public.schedule_items set start_date = '2026-11-27', end_date = '2026-11-30' where id = pg_temp.id('si');
select is((select deadline from public.selections where id = pg_temp.id('sel')), '2026-11-13'::date, 'deadline moves when the schedule item moves');
with x as (insert into public.selection_choices (selection_id, title, client_price, sort) values (pg_temp.id('sel'), 'Subway tile', 900, 1) returning id) insert into ids select 'c1', id from x;
with x as (insert into public.selection_choices (selection_id, title, client_price, sort) values (pg_temp.id('sel'), 'Zellige', 1450, 2) returning id) insert into ids select 'c2', id from x;
insert into public.selection_choice_costs values (pg_temp.id('c2'), 1100);
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'c@sel.test')); reset role;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@sel.test')); reset role;

select pg_temp.login('client');
select is((select count(*)::int from public.selections), 0, 'client does not see unreleased selections');
reset role;
select pg_temp.login('owner'); select public.release_selection(pg_temp.id('sel')); reset role;

select pg_temp.login('client');
select is((select count(*)::int from public.selection_choices), 2, 'client sees the choices with prices');
select is((select count(*)::int from public.selection_choice_costs), 0, 'client never sees builder cost');
select public.choose_selection(pg_temp.id('sel'), pg_temp.id('c2'));
select is((select status::text from public.selections where id = pg_temp.id('sel')), 'selected', 'client pick marks it selected');
update public.selections set allowance = 5000 where id = pg_temp.id('sel');
select is((select allowance from public.selections where id = pg_temp.id('sel')), 1000.00::numeric, 'client cannot change the allowance');
reset role;

select pg_temp.login('sub');
select is((select count(*)::int from public.sub_selections(array[pg_temp.id('job')])), 1, 'shared selection is visible to the job sub');
select is((select count(*)::int from public.selections), 0, 'sub cannot read the selections table (allowance)');
select is((select count(*)::int from public.selection_choices), 0, 'sub cannot read priced choices');
select is((select count(*)::int from public.selection_choices_public(pg_temp.id('sel'))), 2, 'sub reads choices without prices');
select throws_ok(format('select public.choose_selection(%L, %L)', pg_temp.id('sel'), pg_temp.id('c1')), '42501', null, 'sub cannot choose');
reset role;
select pg_temp.login('other');
select is((select count(*)::int from public.selections), 0, 'outsider sees nothing');
reset role;

select pg_temp.login('owner');
insert into ids select 'co', public.approve_selection(pg_temp.id('sel'), true);
select is((select status::text from public.selections where id = pg_temp.id('sel')), 'approved', 'builder approval locks the selection');
select is((select unit_cost from public.change_order_items where change_order_id = pg_temp.id('co')), 450.0000::numeric, 'overage becomes a draft change order line');
select is((select status::text from public.change_orders where id = pg_temp.id('co')), 'draft', 'change order starts as a draft');
update public.selection_choices set client_price = 1 where id = pg_temp.id('c2');
select is((select client_price from public.selection_choices where id = pg_temp.id('c2')), 1450.00::numeric, 'approved selections are locked');
reset role;

select * from finish();
rollback;
