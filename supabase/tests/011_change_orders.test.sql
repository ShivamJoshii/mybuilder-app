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


select pg_temp.mkuser('owner', 'o@co.test'); select pg_temp.mkuser('client', 'c@co.test');
select pg_temp.mkuser('sub', 's@co.test'); select pg_temp.mkuser('other', 'x@co.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('CO Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'House') returning id) insert into ids select 'job', id from x;
insert into public.job_managers (job_id, user_id) values (pg_temp.id('job'), pg_temp.id('owner'));
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Sub One', 's@co.test');
insert into public.job_subs (job_id, sub_org_id) select pg_temp.id('job'), sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'C', 'c@co.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
update public.job_private set contract_price = 0 where job_id = pg_temp.id('job');
with x as (insert into public.change_orders (org_id, job_id, title, description, internal_notes) values (pg_temp.id('org'), pg_temp.id('job'), 'Add pot lights', 'Six pot lights in kitchen', 'Margin note') returning id) insert into ids select 'co1', id from x;
select is((select number from public.change_orders where id = pg_temp.id('co1')), 1, 'change orders are numbered per job');
select public.save_change_order(pg_temp.id('co1'), '{"tax_rate": 5}', jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'title', 'Pot light', 'quantity', 6, 'unit_cost', 50, 'markup_value', 20, 'cost_type', 'material', 'sort', 1),
  jsonb_build_object('id', gen_random_uuid(), 'title', 'Electrician', 'quantity', 4, 'unit_cost', 90, 'markup_type', 'amount', 'markup_value', 40, 'cost_type', 'labor', 'sort', 2)));
update public.change_orders set status = 'approved' where id = pg_temp.id('co1');
select is((select status::text from public.change_orders where id = pg_temp.id('co1')), 'draft', 'status cannot be set directly');
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'c@co.test')); reset role;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@co.test')); reset role;

select pg_temp.login('client');
select is((select count(*)::int from public.change_orders), 0, 'client does not see builder drafts');
select throws_ok(format($q$insert into public.change_orders (org_id, job_id, title) values (%L, %L, 'Bigger deck')$q$, pg_temp.id('org'), pg_temp.id('job')), '42501', null, 'client cannot request changes when the setting is off');
reset role;
update public.client_permission_defaults set settings = settings || '{"submit_change_orders": true}' where org_id = pg_temp.id('org');
select pg_temp.login('client');
with x as (insert into public.change_orders (org_id, job_id, title, description, internal_notes) values (pg_temp.id('org'), pg_temp.id('job'), 'Bigger deck', 'Can we go 16x20?', 'sneaky') returning id) insert into ids select 'req', id from x;
select is((select requested_by_client::text || ':' || coalesce(internal_notes, 'null') from public.change_orders where id = pg_temp.id('req')), 'true:null', 'client request is flagged and cannot carry internal notes');
reset role;
select pg_temp.login('owner');
select is((select count(*)::int from public.notifications where type = 'change_order.requested'), 1, 'manager sees the request in their bell');
reset role;
select is((select count(*)::int from public.notifications where type = 'change_order.requested' and user_id = pg_temp.id('owner')), 1, 'job manager is notified of the client request');

select pg_temp.login('owner');
select public.release_change_order(pg_temp.id('co1'));
select is((select total from public.change_orders where id = pg_temp.id('co1')), 798.00::numeric, 'release freezes the total with tax');
select throws_ok(format($q$select public.save_change_order(%L, '{}', '[]')$q$, pg_temp.id('co1')), '55000', null, 'released change orders are locked');
reset role;

select pg_temp.login('sub');
select is((select count(*)::int from public.change_orders), 0, 'subs never see change orders');
reset role;
select pg_temp.login('other');
select is((select count(*)::int from public.change_orders), 0, 'outsider sees nothing');
reset role;

select pg_temp.login('client');
select is((select count(*)::int from public.change_order_items), 0, 'client cannot read cost lines');
select public.decide_change_order(pg_temp.id('co1'), 'approved', 'C Client', 'typed:C Client');
reset role;
select pg_temp.login('owner');
select is((select sum(original_price)::numeric from public.budget_lines where change_order_id = pg_temp.id('co1')), 760.00::numeric, 'approval adds revised budget lines');
select is((select contract_price from public.job_private where job_id = pg_temp.id('job')), 760.00::numeric, 'approval raises the contract price');
reset role;

select * from finish();
rollback;
