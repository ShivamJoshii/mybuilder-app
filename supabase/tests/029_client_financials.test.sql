begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(6);

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

select pg_temp.mkuser('owner', 'o@cf2.test'); select pg_temp.mkuser('client', 'c@cf2.test'); select pg_temp.mkuser('other', 'x@cf2.test');
select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Money Co');
with x as (insert into public.jobs (org_id, title, status, contract_type) values (pg_temp.id('org'), 'Cost plus reno', 'open', 'open_book') returning id) insert into ids select 'job', id from x;
reset role;   -- budget lines normally come from "send to budget" and approved change orders
insert into public.budget_lines (org_id, job_id, cost_type, original_cost, original_price, source) values
  (pg_temp.id('org'), pg_temp.id('job'), 'material', 80000, 100000, 'estimate'), (pg_temp.id('org'), pg_temp.id('job'), 'material', 4000, 5000, 'change_order');
select pg_temp.login('owner');
with x as (insert into public.bills (org_id, job_id, vendor_name, number, title, tax_amount) values (pg_temp.id('org'), pg_temp.id('job'), 'Lumber Yard', 0, 'Framing lumber', 100) returning id) insert into ids select 'bill', id from x;
insert into public.bill_items (bill_id, title, amount) values (pg_temp.id('bill'), 'Studs', 2000);
select public.set_bill_status(pg_temp.id('bill'), 'approve');
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'C', 'c@cf2.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'c@cf2.test'));
select is(public.client_job_financials(pg_temp.id('job')) ? 'summary', false, 'nothing about money unless the builder turns it on');
reset role;
select pg_temp.login('owner');
insert into public.job_client_permissions (job_id, settings)
  select pg_temp.id('job'), settings || '{"job_price_summary": true, "budget": true, "purchase_orders": true}' from public.client_permission_defaults where org_id = pg_temp.id('org');
reset role;
select pg_temp.login('client');
select is((public.client_job_financials(pg_temp.id('job')) -> 'summary' ->> 'revised')::numeric, 105000::numeric, 'client sees the revised contract');
select is((public.client_job_financials(pg_temp.id('job')) -> 'budget' -> 0 ->> 'actual')::numeric, 2000::numeric, 'and actual cost against budget');
select is((public.client_job_financials(pg_temp.id('job')) -> 'costs' -> 0 ->> 'amount')::numeric, 2100::numeric, 'and the bills behind it');
reset role;
select pg_temp.login('other');
select is(public.client_job_financials(pg_temp.id('job')), null, 'strangers get nothing');
reset role;
select pg_temp.login('owner');
select is(public.client_job_financials(pg_temp.id('job')), null, 'the builder uses the budget pages instead');
reset role;

select * from finish();
rollback;
