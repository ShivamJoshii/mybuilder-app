begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(6);

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


select pg_temp.mkuser('owner', 'o@m.test'); select pg_temp.mkuser('client', 'c@m.test'); select pg_temp.mkuser('other', 'x@m.test');
select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Mail Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'J') returning id) insert into ids select 'job', id from x;
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'C', 'c@m.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
select is((select count(*)::int from public.job_mailboxes where job_id = pg_temp.id('job')), 1, 'every job gets a mailbox');
with x as (insert into public.email_threads (org_id, job_id, subject) values (pg_temp.id('org'), pg_temp.id('job'), 'Hello') returning id) insert into ids select 't', id from x;
insert into public.email_messages (thread_id, direction, from_email, subject, status, sent_by) values (pg_temp.id('t'), 'out', 'o@m.test', 'Hello', 'queued', pg_temp.id('owner'));
select throws_ok($q$select public.ingest_inbound_email('x', 'a@b.c', '', '{}', '{}', 's', 'b', null, null)$q$, '42501', null, 'only the service role can ingest mail');
reset role;
insert into ids select 'in', public.ingest_inbound_email((select token from public.job_mailboxes where job_id = pg_temp.id('job')), 'Sup@Example.com', 'Sup', '{}', '{}', 'RE: Hello', 'Reply body', '<m1@x>', null);
select is((select thread_id from public.email_messages where id = pg_temp.id('in')), pg_temp.id('t'), 'replies thread by subject');
select is(public.ingest_inbound_email((select token from public.job_mailboxes where job_id = pg_temp.id('job')), 'a@b.c', '', '{}', '{}', 'x', 'y', '<m1@x>', null), null, 'duplicate deliveries are ignored');
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'c@m.test'));
select is((select count(*)::int from public.email_messages), 0, 'clients do not read job mail');
reset role;
select pg_temp.login('other');
select is((select count(*)::int from public.job_mailboxes), 0, 'outsiders cannot read mailbox tokens');
reset role;
select * from finish();
rollback;
