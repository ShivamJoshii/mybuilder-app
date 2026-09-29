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

select pg_temp.mkuser('owner', 'o@cp.test'); select pg_temp.mkuser('sub', 's@cp.test'); select pg_temp.mkuser('sub2', 't@cp.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Comply Co');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('org'), 'House', 'open') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Roofing', 's@cp.test');
insert into ids select 'l2', public.add_sub_vendor(pg_temp.id('org'), 'Paint', 't@cp.test');
insert into ids select 'so', sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
select is((select status from public.sub_compliance(pg_temp.id('org'), pg_temp.id('so'))), 'missing', 'a new sub has no certificates');
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@cp.test')); reset role;
select pg_temp.login('sub2'); select public.accept_invite((select token from toks where email = 't@cp.test')); reset role;

-- The sub uploads its own certificates
select pg_temp.login('sub');
insert into public.sub_certificates (builder_org_id, sub_org_id, kind, number, expires_on) values
  (pg_temp.id('org'), pg_temp.id('so'), 'wcb_clearance', 'WCB-123', current_date + 10),
  (pg_temp.id('org'), pg_temp.id('so'), 'liability_insurance', 'POL-9', current_date + 365);
select is((select status from public.sub_compliance(pg_temp.id('org'), pg_temp.id('so'))), 'review', 'certificates a sub enters wait for the builder''s review');
update public.sub_certificates set verified_at = now() where sub_org_id = pg_temp.id('so');
select is((select count(*)::int from public.sub_certificates where verified_at is not null), 0, 'a sub cannot verify its own certificates');
select is(public.compliance_folder(pg_temp.id('so')) is not null, true, 'subs get a compliance folder for documents');
select throws_ok(format('select public.compliance_folder(%L)', pg_temp.id('org')), '42501', null, 'but not in the builder''s company');
update public.organizations set compliance_blocks_payment = true where id = pg_temp.id('org');
reset role;
select pg_temp.login('sub2');
select is((select count(*)::int from public.sub_certificates), 0, 'other subs cannot see the certificates');
select throws_ok(format($q$insert into public.sub_certificates (builder_org_id, sub_org_id, kind) values (%L, %L, 'wcb_clearance')$q$, pg_temp.id('org'), pg_temp.id('so')),
  '42501', null, 'or add certificates for another company');
reset role;

-- Builder: expired WCB blocks payment once the rule is on
select pg_temp.login('owner');
select is((select count(*)::int from public.sub_certificates), 2, 'the builder sees the sub''s certificates');
update public.sub_certificates set verified_at = now() where sub_org_id = pg_temp.id('so');
select is((select status from public.sub_compliance(pg_temp.id('org'), pg_temp.id('so'))), 'expiring', 'once verified, a WCB due within 30 days shows as expiring');
select ok((select detail from public.sub_compliance(pg_temp.id('org'), pg_temp.id('so'))) like 'WCB clearance expires%', 'the detail names the certificate');
update public.sub_certificates set expires_on = current_date - 1 where kind = 'wcb_clearance';
select is((select status from public.sub_compliance(pg_temp.id('org'), pg_temp.id('so'))), 'expired', 'an expired WCB clearance makes the sub non-compliant');
update public.organizations set compliance_blocks_payment = true where id = pg_temp.id('org');
with x as (insert into public.bills (org_id, job_id, sub_org_id, number, title, status) values (pg_temp.id('org'), pg_temp.id('job'), pg_temp.id('so'), 0, 'Roof', 'draft') returning id) insert into ids select 'bill', id from x;
insert into public.bill_items (bill_id, title, amount) values (pg_temp.id('bill'), 'Shingles', 1000);
select public.set_bill_status(pg_temp.id('bill'), 'approve');
select throws_ok(format($q$select public.pay_bill(%L, current_date, 'eft')$q$, pg_temp.id('bill')), '22023', null, 'payment to a non-compliant sub is blocked');
update public.sub_certificates set expires_on = current_date + 200 where kind = 'wcb_clearance';
select lives_ok(format($q$select public.pay_bill(%L, current_date, 'eft')$q$, pg_temp.id('bill')), 'renewed clearance unblocks payment');
reset role;

select * from finish();
rollback;
