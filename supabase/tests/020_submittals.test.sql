begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);

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


select pg_temp.mkuser('owner', 'o@sm.test'); select pg_temp.mkuser('sub', 's@sm.test'); select pg_temp.mkuser('sub2', 's2@sm.test'); select pg_temp.mkuser('arch', 'a@sm.test');
select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Sm Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'J') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Windows', 's@sm.test');
insert into ids select 'l2', public.add_sub_vendor(pg_temp.id('org'), 'Other', 's2@sm.test');
insert into ids select 'so1', sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
select public.invite_internal_user(pg_temp.id('org'), 'a@sm.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'architect'));
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@sm.test')); reset role;
select pg_temp.login('sub2'); select public.accept_invite((select token from toks where email = 's2@sm.test')); reset role;
select pg_temp.login('arch'); select public.accept_invite((select token from toks where email = 'a@sm.test')); reset role;
select pg_temp.login('owner');
with x as (insert into public.submittals (org_id, job_id, number, title, spec_section, kind, submitter_sub_org_id, reviewer_user_id)
  values (pg_temp.id('org'), pg_temp.id('job'), 0, 'Window shop drawings', '08 50 00', 'shop_drawing', pg_temp.id('so1'), pg_temp.id('arch')) returning id) insert into ids select 's', id from x;
reset role;
select pg_temp.login('sub');
select is((select count(*)::int from public.submittals), 0, 'draft submittals are hidden from the sub');
reset role;
select pg_temp.login('owner'); select public.request_submittal(pg_temp.id('s')); reset role;
select is((select count(*)::int from public.notifications where type = 'submittal.requested' and user_id = pg_temp.id('sub')), 1, 'sub is asked');
select pg_temp.login('sub');
select is(public.submit_submittal(pg_temp.id('s'), 'Rev 0 attached'), 0, 'sub submits revision 0');
reset role;
select pg_temp.login('sub2');
select is((select count(*)::int from public.submittals), 0, 'another sub sees nothing');
select throws_ok(format('select public.submit_submittal(%L)', pg_temp.id('s')), '42501', null, 'another sub cannot submit');
reset role;
select pg_temp.login('arch');
select throws_ok(format($q$select public.review_submittal(%L, 'revise')$q$, pg_temp.id('s')), '23514', null, 'revise needs notes');
select public.review_submittal(pg_temp.id('s'), 'revise', 'Show sill detail');
select is((select status::text from public.submittals where id = pg_temp.id('s')), 'revise', 'ball back with the sub');
reset role;
select pg_temp.login('sub');
select is(public.submit_submittal(pg_temp.id('s'), 'Sill detail added'), 1, 'resubmission is revision 1');
reset role;
select pg_temp.login('arch');
select public.review_submittal(pg_temp.id('s'), 'approved');
select is((select status::text || ':' || revision from public.submittals where id = pg_temp.id('s')), 'approved:1', 'approved at revision 1');
reset role;
select pg_temp.login('sub');
select is((select count(*)::int from public.submittal_revisions), 2, 'sub sees the full revision history');
reset role;
select * from finish();
rollback;
