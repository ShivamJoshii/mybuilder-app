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

select pg_temp.mkuser('owner', 'o@c.test'); select pg_temp.mkuser('sub', 's@c.test');
select pg_temp.mkuser('client', 'h@c.test'); select pg_temp.mkuser('other', 'x@c.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Comment Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'J1') returning id) insert into ids select 'job', id from x;
insert into ids select 'link', public.add_sub_vendor(pg_temp.id('org'), 'Subco', 's@c.test');
insert into ids select 'suborg', sub_org_id from public.builder_sub_links where id = pg_temp.id('link');
insert into public.job_subs (job_id, sub_org_id) values (pg_temp.id('job'), pg_temp.id('suborg'));
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'H', 'h@c.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
insert into ids select 'c_internal', public.add_comment(pg_temp.id('job'), 'job', pg_temp.id('job'), 'internal only');
insert into ids select 'c_subs', public.add_comment(pg_temp.id('job'), 'job', pg_temp.id('job'), 'for subs', null, true, false);
insert into ids select 'c_all', public.add_comment(pg_temp.id('job'), 'job', pg_temp.id('job'), 'for everyone', null, true, true);
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;

select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@c.test')); reset role;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'h@c.test')); reset role;

select pg_temp.login('owner');
select is((select count(*)::int from public.comments), 3, 'internal sees all comments');
reset role;

select pg_temp.login('sub');
select is((select count(*)::int from public.comments), 2, 'sub sees only comments shared with subs');
insert into ids select 'c_by_sub', public.add_comment(pg_temp.id('job'), 'job', pg_temp.id('job'), 'from sub', null, false, true);
select is((select visible_to_subs from public.comments where id = pg_temp.id('c_by_sub')), true, 'sub comments are always visible to subs');
select is((select visible_to_clients from public.comments where id = pg_temp.id('c_by_sub')), false, 'sub cannot share with client without job permission');
select is((select author_type from public.comments where id = pg_temp.id('c_by_sub')), 'sub', 'author type set to sub');
reset role;

select pg_temp.login('client');
select is((select count(*)::int from public.comments), 1, 'client sees only comments shared with clients');
insert into ids select 'c_by_client', public.add_comment(pg_temp.id('job'), 'job', pg_temp.id('job'), 'from client', null, true, false);
select is((select visible_to_subs from public.comments where id = pg_temp.id('c_by_client')), false, 'client comments are not shown to subs');
reset role;

select pg_temp.login('other');
select is((select count(*)::int from public.comments), 0, 'outsider sees nothing');
select throws_ok(format($q$select public.add_comment(%L, 'job', %L, 'hi')$q$, pg_temp.id('job'), pg_temp.id('job')),
  '42501', null, 'outsider cannot comment');
reset role;

select pg_temp.login('sub');
update public.comments set body = 'hacked' where id = pg_temp.id('c_all');
reset role;
select is((select body from public.comments where id = pg_temp.id('c_all')), 'for everyone', 'cannot edit someone else''s comment');

select * from finish();
rollback;
