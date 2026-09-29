begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);

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

select pg_temp.mkuser('owner', 'o@f.test'); select pg_temp.mkuser('sub', 's@f.test'); select pg_temp.mkuser('sub2', 's2@f.test');
select pg_temp.mkuser('client', 'h@f.test'); select pg_temp.mkuser('other', 'x@f.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('File Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'J1') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Sub One', 's@f.test');
insert into ids select 'l2', public.add_sub_vendor(pg_temp.id('org'), 'Sub Two', 's2@f.test');
insert into public.job_subs (job_id, sub_org_id) select pg_temp.id('job'), sub_org_id from public.builder_sub_links where id in (pg_temp.id('l1'), pg_temp.id('l2'));
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'H', 'h@f.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
select is((select count(*)::int from public.file_folders where job_id = pg_temp.id('job')), 4, 'new jobs get system folders');
with x as (insert into public.file_folders (org_id, job_id, kind, name) values (pg_temp.id('org'), pg_temp.id('job'), 'documents', 'Plans') returning id) insert into ids select 'plans', id from x;
with x as (insert into public.files (org_id, folder_id, kind, name, storage_key, status) values (pg_temp.id('org'), pg_temp.id('plans'), 'documents', 'internal.pdf', 'k1', 'ready') returning id) insert into ids select 'f_int', id from x;
with x as (insert into public.files (org_id, folder_id, kind, name, storage_key, status, share_subs) values (pg_temp.id('org'), pg_temp.id('plans'), 'documents', 'for-subs.pdf', 'k2', 'ready', true) returning id) insert into ids select 'f_subs', id from x;
with x as (insert into public.files (org_id, folder_id, kind, name, storage_key, status, share_clients) values (pg_temp.id('org'), pg_temp.id('plans'), 'documents', 'for-client.pdf', 'k3', 'ready', true) returning id) insert into ids select 'f_client', id from x;
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@f.test')); reset role;
select pg_temp.login('sub2'); select public.accept_invite((select token from toks where email = 's2@f.test')); reset role;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'h@f.test')); reset role;

select pg_temp.login('owner');
select is((select count(*)::int from public.files), 3, 'owner sees all files');
reset role;
select pg_temp.login('sub');
select is((select count(*)::int from public.files), 1, 'sub sees only files shared with subs');
with x as (insert into public.files (org_id, folder_id, kind, name, storage_key) values (pg_temp.id('org'), (select id from public.file_folders where job_id = pg_temp.id('job') and system_key = 'sub_uploads' and kind = 'documents'), 'documents', 'invoice.pdf', 'k4') returning id) insert into ids select 'f_sub', id from x;
select is((select uploader_type from public.files where id = pg_temp.id('f_sub')), 'sub', 'sub upload is tagged');
select throws_ok(format($q$insert into public.files (org_id, folder_id, kind, name, storage_key) values (%L, %L, 'documents', 'x', 'k5')$q$, pg_temp.id('org'), pg_temp.id('plans')), '42501', null, 'sub cannot upload into builder folders');
reset role;
select pg_temp.login('sub2');
select is((select count(*)::int from public.files), 1, 'another sub does not see sub one''s upload');
reset role;
select pg_temp.login('owner');
select ok((select count(*) from public.files where id = pg_temp.id('f_sub')) = 1, 'builder sees the sub upload');
update public.files set deleted_at = now() where id = pg_temp.id('f_subs');
reset role;
select pg_temp.login('sub');
select is((select count(*)::int from public.files where id = pg_temp.id('f_subs')), 0, 'trashed files disappear for subs');
reset role;
select pg_temp.login('client');
select is((select count(*)::int from public.files), 1, 'client sees only client-shared files');
reset role;
select pg_temp.login('other');
select is((select count(*)::int from public.files), 0, 'outsider sees nothing');
select is((select count(*)::int from public.file_folders), 0, 'outsider sees no folders');
reset role;
select pg_temp.login('owner');
insert into public.file_share_links (file_id) values (pg_temp.id('f_int'));
reset role;
insert into toks select 'share', token from public.file_share_links;
grant select on toks to anon;
set local role anon;
select is((select name from public.resolve_share_link((select token from toks where email = 'share'))), 'internal.pdf', 'share link resolves anonymously');
reset role;

select * from finish();
rollback;
