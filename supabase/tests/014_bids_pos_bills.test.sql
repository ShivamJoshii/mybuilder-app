begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(24);

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


select pg_temp.mkuser('owner', 'o@b.test'); select pg_temp.mkuser('pm', 'pm@b.test'); select pg_temp.mkuser('s1', 's1@b.test'); select pg_temp.mkuser('s2', 's2@b.test'); select pg_temp.mkuser('other', 'x@b.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Bid Co');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('org'), 'House', 'presale') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Framer One', 's1@b.test');
insert into ids select 'l2', public.add_sub_vendor(pg_temp.id('org'), 'Framer Two', 's2@b.test');
insert into ids select 'so1', sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
insert into ids select 'so2', sub_org_id from public.builder_sub_links where id = pg_temp.id('l2');
with x as (insert into public.bid_packages (org_id, job_id, number, title, scope) values (pg_temp.id('org'), pg_temp.id('job'), 0, 'Framing', 'Frame per plans') returning id) insert into ids select 'pkg', id from x;
with x as (insert into public.bid_package_items (package_id, title, quantity, unit, sort) values (pg_temp.id('pkg'), 'Framing labour', 1, 'ls', 1) returning id) insert into ids select 'i1', id from x;
with x as (insert into public.bid_package_items (package_id, title, quantity, unit, sort) values (pg_temp.id('pkg'), 'Sheathing', 100, 'sheet', 2) returning id) insert into ids select 'i2', id from x;
with x as (insert into public.bid_requests (package_id, sub_org_id) values (pg_temp.id('pkg'), pg_temp.id('so1')) returning id) insert into ids select 'r1', id from x;
with x as (insert into public.bid_requests (package_id, sub_org_id) values (pg_temp.id('pkg'), pg_temp.id('so2')) returning id) insert into ids select 'r2', id from x;
select public.invite_internal_user(pg_temp.id('org'), 'pm@b.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'project_manager'));
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('s1'); select public.accept_invite((select token from toks where email = 's1@b.test')); reset role;
select pg_temp.login('pm'); select public.accept_invite((select token from toks where email = 'pm@b.test')); reset role;
insert into public.job_members (job_id, user_id) values (pg_temp.id('job'), pg_temp.id('pm'));
select pg_temp.login('s2'); select public.accept_invite((select token from toks where email = 's2@b.test')); reset role;

select pg_temp.login('s1');
select is((select count(*)::int from public.bid_packages), 0, 'subs do not see draft bid packages');
reset role;
select pg_temp.login('owner'); select public.release_bid_package(pg_temp.id('pkg'), null); reset role;
select is((select count(*)::int from public.notifications where type = 'bid.invited'), 2, 'invited subs are notified');

select pg_temp.login('s1');
select is((select count(*)::int from public.bid_package_items), 2, 'invited sub sees the lines on a presale job');
select public.submit_bid(pg_temp.id('r1'), jsonb_build_array(jsonb_build_object('item_id', pg_temp.id('i1'), 'unit_cost', 5000), jsonb_build_object('item_id', pg_temp.id('i2'), 'unit_cost', 30)), 'Includes nails');
select throws_ok(format($q$select public.submit_bid(%L, '[]')$q$, pg_temp.id('r2')), '42501', null, 'a sub cannot bid for another company');
reset role;
select pg_temp.login('s2');
select throws_ok(format($q$select public.submit_bid(%L, %L)$q$, pg_temp.id('r2'), jsonb_build_array(jsonb_build_object('item_id', pg_temp.id('i1'), 'unit_cost', 1))), '23514', null, 'every line must be priced');
select public.submit_bid(pg_temp.id('r2'), jsonb_build_array(jsonb_build_object('item_id', pg_temp.id('i1'), 'unit_cost', 6000), jsonb_build_object('item_id', pg_temp.id('i2'), 'unit_cost', 25)));
select is((select count(*)::int from public.bid_request_prices), 2, 'a sub sees only its own prices');
select is((select count(*)::int from public.bid_requests), 1, 'a sub sees only its own request');
reset role;
select pg_temp.login('other');
select is((select count(*)::int from public.bid_packages), 0, 'outsider sees no bids');
reset role;

select pg_temp.login('owner');
select is((select total from public.bid_requests where id = pg_temp.id('r1')), 8000.00::numeric, 'bid total is computed');
insert into ids select 'po', public.award_bid(pg_temp.id('r1'));
select is(public.po_total(pg_temp.id('po')), 8000.00::numeric, 'award drafts a PO at the bid prices');
select is((select status::text from public.bid_requests where id = pg_temp.id('r2')), 'not_awarded', 'other bids are marked not awarded');
reset role;
select pg_temp.login('s1');
select is((select count(*)::int from public.purchase_orders), 0, 'draft POs are hidden from the sub');
reset role;
select pg_temp.login('owner'); select public.release_po(pg_temp.id('po')); reset role;
select pg_temp.login('s2');
select is((select count(*)::int from public.purchase_orders), 0, 'another sub never sees the PO');
reset role;
select pg_temp.login('s1');
select throws_ok(format($q$select public.decide_po(%L, 'accepted', 'S One', '')$q$, pg_temp.id('po')), '23514', null, 'accepting needs a signature');
select public.decide_po(pg_temp.id('po'), 'accepted', 'S One', 'typed:S One');
with x as (insert into public.bills (org_id, job_id, po_id, number, title, invoice_ref, tax_amount) values (pg_temp.id('org'), pg_temp.id('job'), pg_temp.id('po'), 0, 'Draw 1', 'INV-77', 125) returning id) insert into ids select 'bill', id from x;
insert into public.bill_items (bill_id, po_item_id, title, amount) select pg_temp.id('bill'), id, title, 2500 from public.po_items where po_id = pg_temp.id('po') and title = 'Framing labour';
select is((select status::text || ':' || holdback_pct from public.bills where id = pg_temp.id('bill')), 'submitted:10.00', 'sub bill is submitted with the PO holdback');
select throws_ok(format($q$insert into public.bill_items (bill_id, po_item_id, title, amount) select %L, id, title, 3001 from public.po_items where po_id = %L and title = 'Sheathing'$q$, pg_temp.id('bill'), pg_temp.id('po')), '23514', null, 'cannot bill past the PO line');
update public.bills set holdback_pct = 0, lien_waiver_required = false, title = 'Draw 1 (rev)' where id = pg_temp.id('bill');
select is((select holdback_pct || ':' || title from public.bills where id = pg_temp.id('bill')), '10.00:Draw 1 (rev)', 'sub cannot remove the holdback from its bill');
with x as (insert into public.bills (org_id, job_id, po_id, number, title, holdback_pct, is_holdback_release) values (pg_temp.id('org'), pg_temp.id('job'), pg_temp.id('po'), 0, 'Sneaky', 0, true) returning id) insert into ids select 'sneaky', id from x;
select is((select holdback_pct || ':' || is_holdback_release from public.bills where id = pg_temp.id('sneaky')), '10.00:false', 'sub cannot file a holdback-free bill');
reset role;

select pg_temp.login('owner'); update public.jobs set status = 'open' where id = pg_temp.id('job'); reset role;
select pg_temp.login('pm');
select lives_ok(format($q$select public.set_bill_status(%L, 'approve')$q$, pg_temp.id('bill')), 'a PM can approve bills');
select throws_ok(format($q$select public.pay_bill(%L, current_date, 'eft')$q$, pg_temp.id('bill')), '42501', null, 'a PM cannot record payments without the permission');
reset role;
select pg_temp.login('owner');
select is(public.pay_bill(pg_temp.id('bill'), current_date, 'eft', 'EFT-1'), 2375.00::numeric, 'payment = subtotal + tax - holdback');
select is((select balance from public.po_holdback(pg_temp.id('po'))), 250.00::numeric, 'holdback balance is tracked on the PO');
insert into ids select 'hb', public.release_holdback(pg_temp.id('po'));
select is(public.bill_subtotal(pg_temp.id('hb')), 250.00::numeric, 'holdback release bill for the balance');
select is((select sum(committed)::numeric || '/' || sum(actual)::numeric from public.job_budget(pg_temp.id('job'))), '8000.00/2500.00', 'budget shows committed and actual cost');
reset role;

select * from finish();
rollback;
