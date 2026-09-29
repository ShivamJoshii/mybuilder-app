-- Regression tests for the September security audit.
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

select pg_temp.mkuser('ownerA', 'a@sec.test'); select pg_temp.mkuser('ownerB', 'b@sec.test');
select pg_temp.mkuser('subadmin', 'boss@sparks.test'); select pg_temp.mkuser('client', 'c@sec.test');

-- Builder A adds a sub; the sub signs up through the invite
select pg_temp.login('ownerA');
insert into ids select 'orgA', public.create_builder_org('Alpha');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('orgA'), 'A1', 'open') returning id) insert into ids select 'jobA', id from x;
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('orgA'), 'A2', 'open') returning id) insert into ids select 'jobA2', id from x;
insert into ids select 'linkA', public.add_sub_vendor(pg_temp.id('orgA'), 'Sparks', 'boss@sparks.test');
insert into ids select 'sparks', sub_org_id from public.builder_sub_links where id = pg_temp.id('linkA');
select is((select status::text from public.builder_sub_links where id = pg_temp.id('linkA')), 'active', 'a company the builder creates is linked right away');
reset role;
create temp table toks on commit drop as select email::text as email, token, org_id from public.invites;
grant select on toks to authenticated;
select pg_temp.login('subadmin'); select public.accept_invite((select token from toks where email = 'boss@sparks.test')); reset role;

-- 1. Invites cannot be forged
select pg_temp.login('ownerB');
insert into ids select 'orgB', public.create_builder_org('Bravo');
select throws_ok(format($q$insert into public.invites (org_id, kind, email, sub_org_id, invited_by) values (%L, 'sub', 'b@sec.test', %L, %L)$q$,
  pg_temp.id('orgB'), pg_temp.id('sparks'), pg_temp.id('ownerB')), '42501', null, 'builders cannot write invites directly');
select throws_ok(format($q$insert into public.org_members (org_id, user_id, role_id) values (%L, %L, %L)$q$, pg_temp.id('orgB'), pg_temp.id('client'),
  (select id from public.roles where org_id = pg_temp.id('orgB') and template_key = 'admin')),
  '42501', null, 'admins cannot add arbitrary people as members');

-- 2. Linking an existing company is pending until its admin accepts
insert into ids select 'linkB', public.add_sub_vendor(pg_temp.id('orgB'), 'Sparks (B)', 'boss@sparks.test');
select is((select sub_org_id from public.builder_sub_links where id = pg_temp.id('linkB')), pg_temp.id('sparks'), 'builder B finds the existing company');
select is((select status::text from public.builder_sub_links where id = pg_temp.id('linkB')), 'pending', 'but the link is pending');
select is((select count(*)::int from public.profiles where id = pg_temp.id('subadmin')), 0, 'a pending link does not reveal the company''s people');
update public.builder_sub_links set status = 'active' where id = pg_temp.id('linkB');
select is((select status::text from public.builder_sub_links where id = pg_temp.id('linkB')), 'pending', 'the builder cannot activate a pending link');
reset role;
drop table toks;
create temp table toks on commit drop as select email::text as email, token, org_id from public.invites;
grant select on toks to authenticated;
select pg_temp.login('client');
select throws_ok(format('select public.accept_invite(%L)', (select token from toks where org_id = pg_temp.id('orgB'))), '42501', null, 'someone else cannot take the invite');
reset role;
select pg_temp.login('subadmin');
select public.accept_invite((select token from toks where org_id = pg_temp.id('orgB')));
select is((select count(*)::int from public.builder_sub_links where sub_org_id = pg_temp.id('sparks') and status = 'active'), 2, 'the sub admin accepts and both links are active');
-- profile email is locked
update public.profiles set email = 'someone@else.test' where id = pg_temp.id('subadmin');
select is((select email::text from public.profiles where id = pg_temp.id('subadmin')), 'boss@sparks.test', 'users cannot change their profile email');
reset role;

-- 3/4. Files: keys under the file's prefix; share links stay on their file; no moving across jobs
select pg_temp.login('ownerA');
with x as (insert into public.file_folders (org_id, job_id, kind, name) values (pg_temp.id('orgA'), pg_temp.id('jobA'), 'documents', 'Docs') returning id) insert into ids select 'folder', id from x;
with x as (insert into public.file_folders (org_id, job_id, kind, name) values (pg_temp.id('orgA'), pg_temp.id('jobA2'), 'documents', 'Other') returning id) insert into ids select 'folder2', id from x;
insert into ids values ('f1', gen_random_uuid()), ('f2', gen_random_uuid());
insert into public.files (id, org_id, folder_id, kind, name, storage_key, status)
  values (pg_temp.id('f1'), pg_temp.id('orgA'), pg_temp.id('folder'), 'documents', 'a.pdf', pg_temp.id('orgA') || '/' || pg_temp.id('jobA') || '/' || pg_temp.id('f1') || '/v1/a.pdf', 'ready');
select throws_ok(format($q$insert into public.files (id, org_id, folder_id, kind, name, storage_key) values (%L, %L, %L, 'documents', 'b.pdf', %L)$q$,
  pg_temp.id('f2'), pg_temp.id('orgA'), pg_temp.id('folder'), pg_temp.id('orgB') || '/global/x/v1/secret.pdf'), '22023', null, 'a file cannot point at another company''s object');
select throws_ok(format($q$update public.files set version = 2, storage_key = %L where id = %L$q$, pg_temp.id('orgB') || '/x', pg_temp.id('f1')), '22023', null, 'a new version cannot point outside the prefix');
select throws_ok(format($q$update public.files set folder_id = %L where id = %L$q$, pg_temp.id('folder2'), pg_temp.id('f1')), '23514', null, 'files cannot move to another job');
insert into public.file_versions (file_id, version, storage_key) values (pg_temp.id('f1'), 9, 'elsewhere/secret');
select is((select version || ':' || (storage_key = (select storage_key from public.files where id = pg_temp.id('f1')))::text from public.file_versions where file_id = pg_temp.id('f1')),
  '1:true', 'old versions always copy the file''s own key');
with x as (insert into public.file_share_links (file_id) values (pg_temp.id('f1')) returning id) insert into ids select 'share', id from x;
insert into ids select 'fB', gen_random_uuid();
select throws_ok(format($q$update public.organizations set logo_url = %L where id = %L$q$, 'storage:' || pg_temp.id('orgB') || '/branding/logo', pg_temp.id('orgA')),
  '22023', null, 'a logo must come from the company''s own branding folder');
with x as (insert into public.plan_sheets (org_id, job_id, number, title) values (pg_temp.id('orgA'), pg_temp.id('jobA'), 'A-1', 'Plan') returning id) insert into ids select 'sheet', id from x;
select throws_ok(format($q$insert into public.plan_sheet_versions (sheet_id, version, storage_key) values (%L, 1, %L)$q$, pg_temp.id('sheet'), pg_temp.id('orgB') || '/x/v1/p.pdf'),
  '22023', null, 'plan versions must live under the job');
reset role;
select pg_temp.login('ownerB');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('orgB'), 'B1', 'open') returning id) insert into ids select 'jobB', id from x;
with x as (insert into public.file_folders (org_id, job_id, kind, name) values (pg_temp.id('orgB'), pg_temp.id('jobB'), 'documents', 'B docs') returning id) insert into ids select 'folderB', id from x;
insert into public.files (id, org_id, folder_id, kind, name, storage_key, status)
  values (pg_temp.id('fB'), pg_temp.id('orgB'), pg_temp.id('folderB'), 'documents', 'b.pdf', pg_temp.id('orgB') || '/' || pg_temp.id('jobB') || '/' || pg_temp.id('fB') || '/v1/b.pdf', 'ready');
with x as (insert into public.file_share_links (file_id) values (pg_temp.id('fB')) returning id) insert into ids select 'shareB', id from x;
update public.file_share_links set file_id = pg_temp.id('f1') where id = pg_temp.id('shareB');
reset role;
select is((select file_id from public.file_share_links where id = pg_temp.id('shareB')), pg_temp.id('fB'), 'a share link cannot be repointed at another file');

-- 5. Proposals stay on their job
select pg_temp.login('ownerA');
with x as (insert into public.estimates (org_id, job_id) values (pg_temp.id('orgA'), pg_temp.id('jobA')) returning id) insert into ids select 'est', id from x;
with x as (insert into public.proposals (org_id, job_id, estimate_id, title) values (pg_temp.id('orgA'), pg_temp.id('jobA'), pg_temp.id('est'), 'P') returning id) insert into ids select 'prop', id from x;
update public.proposals set job_id = pg_temp.id('jobA2') where id = pg_temp.id('prop');
select is((select job_id from public.proposals where id = pg_temp.id('prop')), pg_temp.id('jobA'), 'a proposal cannot move to another job');
select throws_ok(format($q$insert into public.proposals (org_id, job_id, estimate_id, title) values (%L, %L, %L, 'X')$q$, pg_temp.id('orgA'), pg_temp.id('jobA2'), pg_temp.id('est')),
  '23514', null, 'a proposal must use its own job''s estimate');
reset role;

-- 8. Sub notes are not visible to clients
select pg_temp.login('ownerA');
insert into public.job_subs (job_id, sub_org_id) values (pg_temp.id('jobA'), pg_temp.id('sparks'));
insert into public.job_sub_notes (job_id, body) values (pg_temp.id('jobA'), 'Gate code 1234');
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('jobA'), 'C', 'c@sec.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
reset role;
drop table toks;
create temp table toks on commit drop as select email::text as email, token, org_id from public.invites;
grant select on toks to authenticated;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'c@sec.test'));
select is((select count(*)::int from public.job_sub_notes), 0, 'clients do not see notes for subs');
reset role;
select pg_temp.login('subadmin');
select is((select body from public.job_sub_notes where job_id = pg_temp.id('jobA')), 'Gate code 1234', 'subs on the job see them');
-- 7. A sub's comment stays hidden from the client unless the builder allowed sharing
insert into ids select 'subc', public.add_comment(pg_temp.id('jobA'), 'job', pg_temp.id('jobA'), 'note', null, true, false);
update public.comments set visible_to_subs = true, visible_to_clients = true where id = pg_temp.id('subc');
select is((select visible_to_clients::text || visible_to_subs::text from public.comments where id = pg_temp.id('subc')), 'falsefalse', 'a sub cannot widen a comment''s audience later');
reset role;

-- 12. Assignees must be on the job / team
select pg_temp.login('ownerA');
with x as (insert into public.schedule_items (org_id, job_id, title, start_date, end_date) values (pg_temp.id('orgA'), pg_temp.id('jobA'), 'Frame', current_date, current_date) returning id) insert into ids select 'item', id from x;
select throws_ok(format($q$insert into public.schedule_assignees (item_id, user_id) values (%L, %L)$q$, pg_temp.id('item'), pg_temp.id('ownerB')), '23514', null, 'cannot assign someone outside the company');
reset role;

-- 13. Recording a client's approval needs the on-behalf permission; convert still needs leads.convert
select is((select count(*)::int from public.role_actions ra join public.roles r on r.id = ra.role_id
           where r.org_id = pg_temp.id('orgA') and r.template_key = 'org_owner' and ra.action = 'proposals.approve_for_client'), 1, 'owners can record client approvals');

select * from finish();
rollback;
