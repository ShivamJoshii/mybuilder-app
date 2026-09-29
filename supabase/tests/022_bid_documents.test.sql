begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

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

select pg_temp.mkuser('owner', 'o@bd.test'); select pg_temp.mkuser('bidder', 'b@bd.test'); select pg_temp.mkuser('other', 'x@bd.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Doc Co');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('org'), 'House', 'open') returning id) insert into ids select 'job', id from x;
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('org'), 'Other', 'open') returning id) insert into ids select 'job2', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Bidder', 'b@bd.test');
insert into ids select 'l2', public.add_sub_vendor(pg_temp.id('org'), 'Other sub', 'x@bd.test');
insert into ids select 'so1', sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
with x as (insert into public.plan_sheets (org_id, job_id, number, title) values (pg_temp.id('org'), pg_temp.id('job'), 'A-101', 'Floor') returning id) insert into ids select 'sh1', id from x;
with x as (insert into public.plan_sheets (org_id, job_id, number, title) values (pg_temp.id('org'), pg_temp.id('job'), 'A-102', 'Roof') returning id) insert into ids select 'sh2', id from x;
with x as (insert into public.plan_sheets (org_id, job_id, number, title) values (pg_temp.id('org'), pg_temp.id('job2'), 'Z-1', 'Else') returning id) insert into ids select 'shx', id from x;
insert into public.plan_sheet_versions (sheet_id, version, storage_key, status) values (pg_temp.id('sh1'), 1, pg_temp.id('org') || '/' || pg_temp.id('job') || '/set/v1/p.pdf', 'ready');
with x as (insert into public.bid_packages (org_id, job_id, number, title) values (pg_temp.id('org'), pg_temp.id('job'), 0, 'Framing') returning id) insert into ids select 'pkg', id from x;
insert into public.bid_package_items (package_id, title, quantity, unit, sort) values (pg_temp.id('pkg'), 'Labour', 1, 'ls', 1);
insert into public.bid_requests (package_id, sub_org_id) values (pg_temp.id('pkg'), pg_temp.id('so1'));
insert into public.bid_package_sheets (package_id, sheet_id) values (pg_temp.id('pkg'), pg_temp.id('sh1'));
select throws_ok(format($q$insert into public.bid_package_sheets (package_id, sheet_id) values (%L, %L)$q$, pg_temp.id('pkg'), pg_temp.id('shx')), '23514', null, 'only sheets from the package''s job');
insert into ids select 'att', (select id from public.file_folders where job_id = pg_temp.id('job') and system_key = 'attachments');
insert into ids values ('f1', gen_random_uuid());
insert into public.files (id, org_id, folder_id, kind, name, storage_key, status)
  select pg_temp.id('f1'), pg_temp.id('org'), pg_temp.id('att'), 'documents', 'scope.pdf', pg_temp.id('org') || '/' || pg_temp.id('job') || '/' || pg_temp.id('f1') || '/v1/scope.pdf', 'ready';
insert into public.record_attachments (file_id, record_type, record_id) values (pg_temp.id('f1'), 'bid_package', pg_temp.id('pkg'));
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('bidder'); select public.accept_invite((select token from toks where email = 'b@bd.test')); reset role;
select pg_temp.login('other'); select public.accept_invite((select token from toks where email = 'x@bd.test')); reset role;

select pg_temp.login('bidder');
select is((select count(*)::int from public.plan_sheets), 0, 'before release the bidder sees no sheets');
reset role;
select pg_temp.login('owner'); select public.release_bid_package(pg_temp.id('pkg'), null); reset role;

select pg_temp.login('bidder');
select is((select array_agg(number order by number)::text from public.plan_sheets), '{A-101}', 'the bidder sees only the sheets in the package');
select is((select count(*)::int from public.plan_sheet_versions), 1, 'and their versions');
select is((select count(*)::int from public.files where id = pg_temp.id('f1')), 1, 'and the package attachments');
select is((select count(*)::int from public.record_attachments where record_id = pg_temp.id('pkg')), 1, 'attachment links are visible');
select is((select count(*)::int from public.jobs), 0, 'but not the job itself');
select throws_ok(format($q$insert into public.record_attachments (file_id, record_type, record_id) values (%L, 'bid_package', %L)$q$, pg_temp.id('f1'), pg_temp.id('pkg')),
  '42501', null, 'bidders cannot attach files to the package');
reset role;
select pg_temp.login('other');
select is((select count(*)::int from public.plan_sheets) + (select count(*)::int from public.files), 0, 'a sub not invited to bid sees nothing');
reset role;

select * from finish();
rollback;
