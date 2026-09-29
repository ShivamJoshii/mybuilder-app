begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(20);

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

select pg_temp.mkuser('owner', 'o@e.test'); select pg_temp.mkuser('rep', 'r@e.test');
select pg_temp.mkuser('client', 'c@e.test'); select pg_temp.mkuser('other', 'x@e.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Est Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'House') returning id) insert into ids select 'job', id from x;
select public.invite_internal_user(pg_temp.id('org'), 'r@e.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'sales_rep'));
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'C', 'c@e.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
with x as (insert into public.estimates (job_id, tax_rate, tax_label) values (pg_temp.id('job'), 5, 'GST') returning id) insert into ids select 'est', id from x;
with x as (insert into public.estimate_groups (estimate_id, name, sort) values (pg_temp.id('est'), 'Framing', 1) returning id) insert into ids select 'g1', id from x;
with x as (insert into public.estimate_groups (estimate_id, name, sort, is_optional) values (pg_temp.id('est'), 'Deck', 2, true) returning id) insert into ids select 'g2', id from x;
insert into public.estimate_items (estimate_id, group_id, title, quantity, unit_cost, markup_type, markup_value, cost_type)
values (pg_temp.id('est'), pg_temp.id('g1'), 'Lumber', 10, 100, 'percent', 20, 'material'),       -- cost 1000 price 1200
       (pg_temp.id('est'), pg_temp.id('g1'), 'Labour', 1, 500, 'amount', 250, 'labor'),             -- cost 500 price 750
       (pg_temp.id('est'), pg_temp.id('g2'), 'Deck boards', 1, 1000, 'percent', 10, 'material');  -- optional: 1100
select is((select sum(public.item_price(i)) from public.estimate_items i where group_id = pg_temp.id('g1')), 1950.00::numeric, 'price = cost + markup (percent and flat)');
with x as (insert into public.proposals (job_id, estimate_id, title) values (pg_temp.id('job'), pg_temp.id('est'), 'Main proposal') returning id) insert into ids select 'prop', id from x;
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('rep'); select public.accept_invite((select token from toks where email = 'r@e.test')); reset role;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'c@e.test')); reset role;
select pg_temp.login('owner');
insert into public.job_members (job_id, user_id) values (pg_temp.id('job'), pg_temp.id('rep'));
reset role;

-- cost vs price
select pg_temp.login('rep');
select is((select count(*)::int from public.estimate_items), 0, 'sales rep cannot read cost lines');
select is((select count(*)::int from public.estimate_price_lines(pg_temp.id('est'))), 3, 'sales rep reads price-only lines');
select is((select sum(price) from public.estimate_price_lines(pg_temp.id('est')) where title = 'Lumber'), 1200.00::numeric, 'price line carries marked-up price');
reset role;

-- client can't see drafts
select pg_temp.login('client');
select is((select count(*)::int from public.proposals), 0, 'client does not see draft proposals');
select is((select count(*)::int from public.estimates), 0, 'client never sees the estimate');
reset role;

select pg_temp.login('owner');
select throws_ok(format('select public.send_estimate_to_budget(%L)', pg_temp.id('est')), '22023', null, 'cannot send to budget before approval');
select public.release_proposal(pg_temp.id('prop'));
select is((select total from public.proposals where id = pg_temp.id('prop')), 2047.50::numeric, 'release freezes totals with tax (optional groups excluded)');
reset role;

select pg_temp.login('client');
select is((select count(*)::int from public.proposals), 1, 'client sees released proposal');
select throws_ok(format($q$select public.decide_proposal(%L, 'approved', 'C Client', '')$q$, pg_temp.id('prop')), '23514', null, 'signature is required to approve');
select lives_ok(format($q$select public.decide_proposal(%L, 'approved', 'C Client', 'C Client')$q$, pg_temp.id('prop')), 'client approves with a signature');
select is((select on_behalf from public.proposal_signatures), false, 'signature recorded as the client');
reset role;

select pg_temp.login('other');
select is((select count(*)::int from public.proposals), 0, 'outsider sees no proposals');
reset role;

select pg_temp.login('owner');
select public.send_estimate_to_budget(pg_temp.id('est'));
select is((select sum(original_price) from public.budget_lines where job_id = pg_temp.id('job')), 1950.00::numeric, 'budget holds approved scope only');
update public.estimate_items set unit_cost = 1 where estimate_id = pg_temp.id('est');
select is((select sum(unit_cost) from public.estimate_items where estimate_id = pg_temp.id('est')), 1600.0000::numeric, 'locked estimate cannot be edited');
select is((select contract_price from public.job_private where job_id = pg_temp.id('job')), 1950.00::numeric, 'contract price set from the budget');
select throws_ok(format($q$select public.save_estimate(%L, '{}', '[]', '[]')$q$, pg_temp.id('est')), '55000', null, 'worksheet save refused while locked');
select public.unlock_estimate(pg_temp.id('est'));
select is((select count(*)::int from public.budget_lines where job_id = pg_temp.id('job')), 0, 'unlock clears the estimate budget');
select public.save_estimate(pg_temp.id('est'), '{"tax_rate": 13, "tax_label": "HST"}',
  jsonb_build_array(jsonb_build_object('id', pg_temp.id('g1'), 'name', 'Framing 2', 'sort', 1)),
  jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'group_id', pg_temp.id('g1'), 'title', 'Nails', 'quantity', 2, 'unit_cost', 10, 'markup_value', 50, 'sort', 1)));
select is((select string_agg(title, ',') from public.estimate_items where estimate_id = pg_temp.id('est')), 'Nails', 'save replaces the line items');
select is((select tax_label || ':' || (select count(*) from public.estimate_groups where estimate_id = pg_temp.id('est')) from public.estimates where id = pg_temp.id('est')), 'HST:1', 'save updates settings and drops removed groups');
reset role;

select * from finish();
rollback;
