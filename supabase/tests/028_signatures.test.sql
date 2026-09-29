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

select pg_temp.mkuser('owner', 'o@sg.test'); select pg_temp.mkuser('client', 'c@sg.test'); select pg_temp.mkuser('sub', 's@sg.test'); select pg_temp.mkuser('sub2', 't@sg.test');

select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Sign Co');
with x as (insert into public.jobs (org_id, title, status) values (pg_temp.id('org'), 'House', 'open') returning id) insert into ids select 'job', id from x;
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Framer', 's@sg.test');
insert into ids select 'l2', public.add_sub_vendor(pg_temp.id('org'), 'Other', 't@sg.test');
insert into ids select 'so', sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
insert into public.job_subs (job_id, sub_org_id) values (pg_temp.id('job'), pg_temp.id('so'));
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'C', 'c@sg.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
insert into ids values ('f', gen_random_uuid());
insert into public.files (id, org_id, folder_id, kind, name, mime, storage_key, status)
  select pg_temp.id('f'), pg_temp.id('org'), id, 'documents', 'contract.pdf', 'application/pdf', pg_temp.id('org') || '/' || pg_temp.id('job') || '/' || pg_temp.id('f') || '/v1/contract.pdf', 'ready'
  from public.file_folders where job_id = pg_temp.id('job') and system_key = 'attachments';
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'c@sg.test')); reset role;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@sg.test')); reset role;
select pg_temp.login('sub2'); select public.accept_invite((select token from toks where email = 't@sg.test')); reset role;

select pg_temp.login('owner');
with x as (insert into public.signature_requests (org_id, job_id, file_id, title, in_order) values (pg_temp.id('org'), pg_temp.id('job'), pg_temp.id('f'), 'Construction contract', true) returning id) insert into ids select 'req', id from x;
insert into public.signature_request_signers (request_id, sort, user_id, label) values (pg_temp.id('req'), 1, pg_temp.id('client'), 'Client');
insert into public.signature_request_signers (request_id, sort, sub_org_id, label) values (pg_temp.id('req'), 2, pg_temp.id('so'), 'Framer');
select throws_ok(format($q$insert into public.signature_request_signers (request_id, sort, sub_org_id, label) values (%L, 3, %L, 'X')$q$, pg_temp.id('req'),
  (select sub_org_id from public.builder_sub_links where id = pg_temp.id('l2'))), '23514', null, 'signers must be on the job');
reset role;
select pg_temp.login('client');
select is((select count(*)::int from public.signature_requests), 0, 'drafts are private');
reset role;
select pg_temp.login('owner');
select public.send_signature_request(pg_temp.id('req'), repeat('a', 64));
select is((select status::text from public.signature_requests where id = pg_temp.id('req')), 'sent', 'request is sent');
reset role;
select is((select count(*)::int from public.notifications where type = 'signature.requested' and user_id = pg_temp.id('client')), 1, 'the first signer is asked');
select is((select count(*)::int from public.notifications where type = 'signature.requested' and user_id = pg_temp.id('sub')), 0, 'the second waits their turn');

select pg_temp.login('sub');
select throws_ok(format($q$select public.sign_document(%L, 'signed', 'S', 'typed:S')$q$, pg_temp.id('req')), '42501', null, 'signing in order is enforced');
reset role;
select pg_temp.login('client');
select is((select count(*)::int from public.files where id = pg_temp.id('f')), 1, 'the signer can open the document');
select is(public.sign_document(pg_temp.id('req'), 'signed', 'Cara Client', 'typed:Cara Client', null, '203.0.113.9', 'Test'), 'sent', 'the client signs');
update public.signature_request_signers set status = 'pending', signature = null where request_id = pg_temp.id('req');
select is((select status from public.signature_request_signers where user_id = pg_temp.id('client')), 'signed', 'signatures cannot be undone');
reset role;
select pg_temp.login('sub2');
select is((select count(*)::int from public.signature_requests) + (select count(*)::int from public.files where id = pg_temp.id('f')), 0, 'others see nothing');
reset role;
select pg_temp.login('sub');
select is((select count(*)::int from public.notifications where type = 'signature.requested'), 1, 'now the sub is asked');
select is(public.sign_document(pg_temp.id('req'), 'signed', 'Sam Sub', 'typed:Sam Sub'), 'completed', 'last signature completes it');
reset role;
select is((select count(*)::int from public.notifications where type = 'signature.completed' and user_id = pg_temp.id('owner')), 1, 'the sender hears it is done');

select * from finish();
rollback;
