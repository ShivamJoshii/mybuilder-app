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


select pg_temp.mkuser('owner', 'o@c.test'); select pg_temp.mkuser('pm', 'pm@c.test'); select pg_temp.mkuser('sub', 's@c.test');
select pg_temp.mkuser('client', 'h@c.test'); select pg_temp.mkuser('client2', 'h2@c.test'); select pg_temp.mkuser('other', 'x@c.test');
select pg_temp.login('owner');
insert into ids select 'org', public.create_builder_org('Chat Co');
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'J1') returning id) insert into ids select 'job', id from x;
with x as (insert into public.jobs (org_id, title) values (pg_temp.id('org'), 'J2') returning id) insert into ids select 'job2', id from x;
select public.invite_internal_user(pg_temp.id('org'), 'pm@c.test', (select id from public.roles where org_id = pg_temp.id('org') and template_key = 'project_manager'));
insert into ids select 'l1', public.add_sub_vendor(pg_temp.id('org'), 'Sub', 's@c.test');
insert into public.job_subs (job_id, sub_org_id) select pg_temp.id('job'), sub_org_id from public.builder_sub_links where id = pg_temp.id('l1');
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job'), 'H', 'h@c.test') returning id) insert into ids select 'jc', id from x;
select public.invite_job_client(pg_temp.id('jc'));
with x as (insert into public.job_clients (job_id, first_name, email) values (pg_temp.id('job2'), 'H2', 'h2@c.test') returning id) insert into ids select 'jc2', id from x;
select public.invite_job_client(pg_temp.id('jc2'));
reset role;
create temp table toks on commit drop as select email::text as email, token from public.invites;
grant select on toks to authenticated;
select pg_temp.login('pm'); select public.accept_invite((select token from toks where email = 'pm@c.test')); reset role;
select pg_temp.login('sub'); select public.accept_invite((select token from toks where email = 's@c.test')); reset role;
select pg_temp.login('client'); select public.accept_invite((select token from toks where email = 'h@c.test')); reset role;
select pg_temp.login('client2'); select public.accept_invite((select token from toks where email = 'h2@c.test')); reset role;

select pg_temp.login('owner');
select is((select count(*)::int from public.chat_directory(pg_temp.id('org'), pg_temp.id('job'))), 3, 'directory: team, job sub and job client');
insert into ids select 'conv', public.start_conversation(pg_temp.id('org'), pg_temp.id('job'), array[pg_temp.id('sub'), pg_temp.id('client')], 'Kitchen', 'Hi both');
select throws_ok(format($q$select public.start_conversation(%L, %L, array[%L]::uuid[])$q$, pg_temp.id('org'), pg_temp.id('job'), pg_temp.id('client2')), '42501', null, 'cannot pull in a client from another job');
insert into ids select 'dm', public.start_conversation(pg_temp.id('org'), null, array[pg_temp.id('pm')]);
select is(public.start_conversation(pg_temp.id('org'), null, array[pg_temp.id('pm')]), pg_temp.id('dm'), '1:1 conversations are reused');
reset role;
select is((select count(*)::int from public.notifications where type = 'chat.message'), 2, 'other members are notified');
select pg_temp.login('client');
select is((select count(*)::int from public.chat_feed(pg_temp.id('conv'))), 1, 'member reads the conversation');
select is((select unread from public.my_chats() where conversation_id = pg_temp.id('conv')), 1, 'unread count');
select public.mark_chat_read(pg_temp.id('conv'));
select is((select unread from public.my_chats() where conversation_id = pg_temp.id('conv')), 0, 'mark read');
select throws_ok(format($q$select public.start_conversation(%L, %L, array[%L]::uuid[])$q$, pg_temp.id('org'), pg_temp.id('job'), pg_temp.id('sub')), '42501', null, 'clients can only message the builder team');
reset role;
select pg_temp.login('other');
select is((select count(*)::int from public.chat_messages), 0, 'outsider reads nothing');
reset role;
select pg_temp.login('pm');
select is((select count(*)::int from public.chat_messages where conversation_id = pg_temp.id('conv')), 0, 'non-members on the team cannot read others'' chats');
reset role;
select * from finish();
rollback;
