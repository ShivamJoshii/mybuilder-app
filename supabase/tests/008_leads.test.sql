begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(15);

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

select pg_temp.mkuser('owner', 'o@l.test'); select pg_temp.mkuser('rep', 'r@l.test'); select pg_temp.mkuser('rep2', 'r2@l.test');
select pg_temp.mkuser('crew', 'c@l.test'); select pg_temp.mkuser('other', 'x@l.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Lead Co');
select public.invite_internal_user(pg_temp.id('org'), 'r@l.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'sales_rep'));
select public.invite_internal_user(pg_temp.id('org'), 'r2@l.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'sales_rep'));
select public.invite_internal_user(pg_temp.id('org'), 'c@l.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'field_crew'));
insert into public.lead_forms (org_id, name) values (pg_temp.id('org'), 'Website');
select is((select count(*)::int from public.lead_statuses where org_id = pg_temp.id('org')), 8, 'new builders get 8 default lead statuses');
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('rep'); select public.accept_invite((select token from toks where email = 'r@l.test')); reset role;
select pg_temp.login('rep2'); select public.accept_invite((select token from toks where email = 'r2@l.test')); reset role;
select pg_temp.login('crew'); select public.accept_invite((select token from toks where email = 'c@l.test')); reset role;
select pg_temp.login('other'); insert into ids select 'org2', public.create_builder_org('Other Co'); reset role;

-- Anonymous web form
insert into toks select 'form', token from public.lead_forms;
grant select on toks to anon;
set local role anon;
select ok(public.submit_lead_form((select token from toks where email = 'form'), '{"first_name":"Hank","last_name":"Home","email":"hank@home.test","message":"Need a garage suite"}'), 'anonymous web form creates a lead');
select throws_ok($q$select public.submit_lead_form((select token from toks where email = 'form'), '{"first_name":"","email":"x@y.z"}')$q$, '23514', null, 'web form requires a name');
select throws_ok($q$select count(*) from public.leads$q$, '42501', null, 'anon cannot read leads');
reset role;

select pg_temp.login('rep');
with x as (insert into public.leads (org_id, title, status_id) values (pg_temp.id('org'), 'Rep lead', (select id from public.lead_statuses where org_id = pg_temp.id('org') and name = 'New')) returning id) insert into ids select 'mylead', id from x;
select is((select count(*)::int from public.leads), 1, 'sales rep sees only own leads');
reset role;
select pg_temp.login('rep2');
select is((select count(*)::int from public.leads), 0, 'another rep does not see it');
reset role;
select pg_temp.login('owner');
select is((select count(*)::int from public.leads), 2, 'owner sees all leads');
select is((select count(*)::int from public.notifications where type = 'lead.new'), 1, 'owner told about the web lead');
insert into public.lead_salespeople (lead_id, user_id) select id, pg_temp.id('rep2') from public.leads where title = 'Hank Home';
reset role;
select pg_temp.login('rep2');
select is((select count(*)::int from public.leads), 1, 'assigned salesperson sees the lead');
insert into ids select 'job', public.convert_lead_to_job((select id from public.leads where title = 'Hank Home'), 'Hank garage suite', 'fixed_price', 185000);
select is((select category::text from public.leads l join public.lead_statuses s on s.id = l.status_id where l.title = 'Hank Home'), 'won', 'converted lead is Sold');
select is((select count(*)::int from public.job_clients where job_id = pg_temp.id('job')), 1, 'lead contact becomes the job client');
reset role;
select pg_temp.login('crew');
select is((select count(*)::int from public.leads), 0, 'field crew sees no leads');
reset role;

-- Estimating a lead before it is sold, then converting it, keeps one job
select pg_temp.login('owner');
insert into ids select 'lead2', id from public.leads where title = 'Rep lead';
insert into ids select 'pjob', public.start_lead_job(pg_temp.id('lead2'));
select is((select status::text from public.jobs where id = pg_temp.id('pjob')), 'presale', 'estimating a lead opens a Presale job');
select is(public.start_lead_job(pg_temp.id('lead2')), pg_temp.id('pjob'), 'asking again returns the same job');
select is(public.convert_lead_to_job(pg_temp.id('lead2'), 'Rep lead home', 'fixed_price', 500000), pg_temp.id('pjob'), 'converting reuses the estimated job');
reset role;

select * from finish();
rollback;
