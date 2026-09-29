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


select pg_temp.mkuser('owner', 'o@inv.test'); select pg_temp.mkuser('client', 'c@inv.test'); select pg_temp.mkuser('other', 'x@inv.test');
select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Inv Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'House') returning id) insert into ids select 'job', id from x;
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'C', 'c@inv.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
reset role;
insert into public.budget_lines (org_id, job_id, cost_type, original_cost, original_price) values (pg_temp.id('org'), pg_temp.id('job'), 'labor', 80000, 100000);
select pg_temp.login('owner');
select is(public.job_contract(pg_temp.id('job')), 100000.00::numeric, 'contract price comes from the budget');
with x as (insert into public.client_invoices (org_id, job_id, number, title, tax_rate, tax_label, holdback_pct) values (pg_temp.id('org'), pg_temp.id('job'), 0, 'Draw 1 — foundation', 5, 'GST', 10) returning id) insert into ids select 'inv', id from x;
select public.save_invoice_lines(pg_temp.id('inv'), '[{"kind":"percent","title":"15% of contract","percent":15,"amount":15000,"taxable":true,"sort":1}]');
select is((select total from public.invoice_totals(pg_temp.id('inv'))), 14250.00::numeric, 'total = subtotal + GST − owner holdback');
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'c@inv.test'));
select is((select count(*)::int from public.client_invoices), 0, 'client does not see draft invoices');
reset role;
select pg_temp.login('owner'); select public.release_invoice(pg_temp.id('inv'));
select throws_ok(format($q$select public.save_invoice_lines(%L, '[]')$q$, pg_temp.id('inv')), '55000', null, 'released invoices are locked');
reset role;
select is((select count(*)::int from public.notifications where type = 'invoice.released' and user_id = pg_temp.id('client')), 1, 'client is notified');
select pg_temp.login('client');
select is((select count(*)::int from public.client_invoices), 1, 'client sees the released invoice');
select is((select count(*)::int from public.client_invoice_lines), 1, 'client sees its lines');
select throws_ok(format($q$select public.record_client_payment(%L, current_date, 100, 'eft')$q$, pg_temp.id('inv')), '42501', null, 'client cannot record payments');
reset role;
select pg_temp.login('other');
select is((select count(*)::int from public.client_invoices), 0, 'outsider sees nothing');
reset role;
select pg_temp.login('owner');
select public.record_client_payment(pg_temp.id('inv'), current_date, 10000, 'eft', 'E1');
select is((select status::text from public.client_invoices where id = pg_temp.id('inv')), 'released', 'partial payment keeps it open');
select public.record_client_payment(pg_temp.id('inv'), current_date, 4250, 'cheque', '1042');
select is((select status::text || ':' || (select balance from public.invoice_totals(pg_temp.id('inv')))::text from public.client_invoices where id = pg_temp.id('inv')), 'paid:0.00', 'paid in full');
select is((select contract::text || '/' || billed::text || '/' || received::text from public.report_wip(pg_temp.id('org'))), '100000.00/15000.00/14250.00', 'WIP report sums contract, billed and received');
select is((select count(*)::int from public.report_receivables(pg_temp.id('org'))), 0, 'paid invoices leave receivables');
reset role;
select pg_temp.login('client');
select is((select count(*)::int from public.report_wip(pg_temp.id('org'))), 0, 'clients get no company reports');
reset role;
select * from finish();
rollback;
