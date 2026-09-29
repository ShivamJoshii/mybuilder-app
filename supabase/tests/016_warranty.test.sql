begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(11);

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


select pg_temp.mkuser('owner', 'o@w.test'); select pg_temp.mkuser('client', 'c@w.test'); select pg_temp.mkuser('sub', 's@w.test');
select pg_temp.mkuser('sub2', 's2@w.test'); select pg_temp.mkuser('other', 'x@w.test');
select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('War Co');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('org'), 'House', 'warranty') returning id) insert into ids select 'job', id from x;
insert into public.job_managers (job_id, user_id) values (pg_temp.id('job'), pg_temp.id('owner'));
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Plumb', 's@w.test');
insert into ids select 'l2', public.add_sub_vendor(pg_temp.id('org'), 'Paint', 's2@w.test');
insert into ids select 'so1', sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'C', 'c@w.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'c@w.test')); reset role;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@w.test')); reset role;
select pg_temp.login('sub2'); select public.accept_invite((select token from toks where email = 's2@w.test')); reset role;

select pg_temp.login('client');
with x as (insert into public.warranty_claims (org_id, job_id, number, title, description, assignee_sub_org_id) values (pg_temp.id('org'), pg_temp.id('job'), 0, 'Leaky tap', 'Kitchen tap drips', pg_temp.id('so1')) returning id) insert into ids select 'wc', id from x;
select is((select submitted_by_client::text || ':' || coalesce(assignee_sub_org_id::text, 'none') from public.warranty_claims where id = pg_temp.id('wc')), 'true:none', 'client claim is flagged and cannot self-assign');
reset role;
select is((select count(*)::int from public.notifications where type = 'warranty.submitted' and user_id = pg_temp.id('owner')), 1, 'job manager hears about the claim');
select pg_temp.login('owner');
update public.warranty_claims set assignee_sub_org_id = pg_temp.id('so1'), priority = 'urgent' where id = pg_temp.id('wc');
insert into public.warranty_claim_notes values (pg_temp.id('wc'), 'Tap was client-supplied');
with x as (insert into public.warranty_appointments (claim_id, starts_at, assignee_sub_org_id) values (pg_temp.id('wc'), '2026-10-05 16:00+00', pg_temp.id('so1')) returning id) insert into ids select 'ap', id from x;
select is((select status::text from public.warranty_claims where id = pg_temp.id('wc')), 'scheduled', 'booking an appointment schedules the claim');
reset role;
select pg_temp.login('sub');
select is((select count(*)::int from public.warranty_claims), 1, 'assigned sub sees the claim');
select is((select count(*)::int from public.warranty_claim_notes), 0, 'sub never sees internal notes');
select public.update_appointment(pg_temp.id('ap'), 'completed', 'Replaced cartridge');
select throws_ok(format($q$select public.update_appointment(%L, 'cancelled')$q$, pg_temp.id('ap')), '22023', null, 'subs can only confirm or complete');
reset role;
select pg_temp.login('sub2');
select is((select count(*)::int from public.warranty_claims), 0, 'unassigned sub sees nothing');
reset role;
select pg_temp.login('client');
select is((select count(*)::int from public.warranty_claim_notes), 0, 'client never sees internal notes');
select throws_ok(format($q$select public.claim_feedback(%L, 5, 'Great')$q$, pg_temp.id('wc')), '22023', null, 'feedback waits for resolution');
reset role;
select pg_temp.login('owner'); update public.warranty_claims set status = 'resolved' where id = pg_temp.id('wc'); reset role;
select pg_temp.login('client');
select public.claim_feedback(pg_temp.id('wc'), 5, 'Fast fix');
select is((select client_rating from public.warranty_claims where id = pg_temp.id('wc')), 5, 'client leaves a rating');
reset role;
select pg_temp.login('other');
select is((select count(*)::int from public.warranty_claims), 0, 'outsider sees nothing');
reset role;
select * from finish();
rollback;
