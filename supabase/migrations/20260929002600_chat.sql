-- =====================================================================
-- Chat: conversations between a builder's team, its subs and its clients.
-- Conversations belong to a builder org (and optionally a job). Members
-- are checked when the conversation is created: team members of the
-- builder, users of linked subs (on the job, if there is one) and the
-- job's clients. Only members can read or post.
-- =====================================================================
create table public.chat_conversations (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  job_id           uuid references public.jobs (id) on delete cascade,
  title            text check (length(title) <= 120),
  created_by       uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);
create table public.chat_members (
  conversation_id  uuid not null references public.chat_conversations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  last_read_at     timestamptz not null default now(),
  muted            boolean not null default false,
  primary key (conversation_id, user_id)
);
create index chat_members_user on public.chat_members (user_id);
create table public.chat_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.chat_conversations (id) on delete cascade,
  author_id        uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  body             text not null check (length(trim(body)) between 1 and 4000),
  created_at       timestamptz not null default now(),
  edited_at        timestamptz,
  deleted_at       timestamptz
);
create index chat_messages_conv on public.chat_messages (conversation_id, created_at);

create or replace function private.is_chat_member(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_members where conversation_id = p_conv and user_id = auth.uid());
$$;
grant execute on function private.is_chat_member(uuid) to authenticated;

-- Can p_user be in a conversation of builder p_org (on job p_job)?
create or replace function private.chat_reachable(p_org uuid, p_job uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = p_user and m.status = 'active')
      or exists (select 1 from public.builder_sub_links l join public.org_members m on m.org_id = l.sub_org_id and m.user_id = p_user and m.status = 'active'
                 where l.builder_org_id = p_org and l.status = 'active'
                   and (p_job is null or exists (select 1 from public.job_subs js where js.job_id = p_job and js.sub_org_id = l.sub_org_id)))
      or (p_job is not null and exists (select 1 from public.job_clients c where c.job_id = p_job and c.user_id = p_user));
$$;

-- People the caller may start a chat with, for a builder (and job)
create or replace function public.chat_directory(p_org uuid, p_job uuid default null)
returns table (user_id uuid, name text, email text, kind text, company text)
language sql stable security definer set search_path = '' as $$
  with me as (select private.chat_reachable(p_org, p_job, auth.uid()) ok, private.is_member(p_org) internal)
  select p.id, trim(p.first_name || ' ' || p.last_name), p.email::text, 'team', o.name
  from public.org_members m join public.profiles p on p.id = m.user_id join public.organizations o on o.id = m.org_id, me
  where m.org_id = p_org and m.status = 'active' and me.ok and p.id <> auth.uid()
  union all
  select p.id, trim(p.first_name || ' ' || p.last_name), p.email::text, 'sub', l.company_name
  from public.builder_sub_links l join public.org_members m on m.org_id = l.sub_org_id and m.status = 'active' join public.profiles p on p.id = m.user_id, me
  where l.builder_org_id = p_org and l.status = 'active' and me.internal and p.id <> auth.uid()
    and (p_job is null or exists (select 1 from public.job_subs js where js.job_id = p_job and js.sub_org_id = l.sub_org_id))
  union all
  select p.id, trim(p.first_name || ' ' || p.last_name), p.email::text, 'client', null
  from public.job_clients c join public.profiles p on p.id = c.user_id, me
  where p_job is not null and c.job_id = p_job and me.internal and p.id <> auth.uid();
$$;

create or replace function public.start_conversation(p_org uuid, p_job uuid, p_users uuid[], p_title text default null, p_body text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; u uuid; v_internal boolean;
begin
  if not private.chat_reachable(p_org, p_job, auth.uid()) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_job is not null and not exists (select 1 from public.jobs where id = p_job and org_id = p_org) then raise exception 'Job not found' using errcode = '23514'; end if;
  if coalesce(cardinality(p_users), 0) = 0 then raise exception 'Pick at least one person' using errcode = '23514'; end if;
  v_internal := private.is_member(p_org);
  foreach u in array p_users loop
    if not private.chat_reachable(p_org, p_job, u) then raise exception 'You can’t chat with one of those people here' using errcode = '42501'; end if;
    -- subs and clients may only start conversations with the builder's team
    if not v_internal and not exists (select 1 from public.org_members where org_id = p_org and user_id = u and status = 'active') then
      raise exception 'You can message the builder’s team' using errcode = '42501';
    end if;
  end loop;
  -- reuse an existing 1:1 conversation
  if cardinality(p_users) = 1 and p_title is null then
    select c.id into v_id from public.chat_conversations c
    where c.org_id = p_org and c.job_id is not distinct from p_job and c.title is null
      and (select array_agg(user_id order by user_id) from public.chat_members where conversation_id = c.id) = (select array_agg(x order by x) from unnest(array[auth.uid(), p_users[1]]) x)
    limit 1;
  end if;
  if v_id is null then
    insert into public.chat_conversations (org_id, job_id, title) values (p_org, p_job, nullif(trim(p_title), '')) returning id into v_id;
    insert into public.chat_members (conversation_id, user_id, last_read_at)
      select v_id, x, case when x = auth.uid() then now() else '-infinity'::timestamptz end from (select auth.uid() x union select unnest(p_users)) s;
  end if;
  if coalesce(trim(p_body), '') <> '' then insert into public.chat_messages (conversation_id, body) values (v_id, trim(p_body)); end if;
  return v_id;
end $$;

create or replace function private.chat_message_posted()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.chat_conversations; v_users uuid[];
begin
  update public.chat_conversations set last_message_at = new.created_at where id = new.conversation_id returning * into c;
  update public.chat_members set last_read_at = new.created_at where conversation_id = new.conversation_id and user_id = new.author_id;
  select coalesce(array_agg(user_id), '{}') into v_users from public.chat_members where conversation_id = new.conversation_id and user_id <> new.author_id and not muted;
  perform private.notify(v_users, c.org_id, c.job_id, 'chat.message',
    (select trim(first_name || ' ' || last_name) from public.profiles where id = new.author_id) || coalesce(' in ' || c.title, ''), left(new.body, 200), '/chat?c=' || c.id);
  return null;
end $$;
create trigger chat_messages_posted after insert on public.chat_messages for each row execute function private.chat_message_posted();

create or replace function public.mark_chat_read(p_conv uuid)
returns void language sql security definer set search_path = '' as $$
  update public.chat_members set last_read_at = now() where conversation_id = p_conv and user_id = auth.uid();
$$;

-- Unread counts per conversation for the caller
create or replace function public.my_chats()
returns table (conversation_id uuid, org_id uuid, job_id uuid, title text, last_message_at timestamptz, unread int, members text[], last_body text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.org_id, c.job_id, c.title, c.last_message_at,
    (select count(*)::int from public.chat_messages x where x.conversation_id = c.id and x.created_at > m.last_read_at and x.author_id <> auth.uid() and x.deleted_at is null),
    (select array_agg(trim(p.first_name || ' ' || p.last_name) order by p.first_name) from public.chat_members cm join public.profiles p on p.id = cm.user_id where cm.conversation_id = c.id and cm.user_id <> auth.uid()),
    (select x.body from public.chat_messages x where x.conversation_id = c.id and x.deleted_at is null order by x.created_at desc limit 1)
  from public.chat_members m join public.chat_conversations c on c.id = m.conversation_id
  where m.user_id = auth.uid()
  order by c.last_message_at desc;
$$;

do $$ declare f text; begin
  foreach f in array array['chat_directory(uuid, uuid)', 'start_conversation(uuid, uuid, uuid[], text, text)', 'mark_chat_read(uuid)', 'my_chats()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

insert into public.app_notification_types (key, grp, module, label, default_email, default_push, sort) values
  ('chat.message', 'Messaging', 'Chat', 'New chat message', false, true, 80);

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
create policy chat_conv_select on public.chat_conversations for select to authenticated using (private.is_chat_member(id));
create policy chat_conv_update on public.chat_conversations for update to authenticated using (private.is_chat_member(id)) with check (private.is_chat_member(id));
create policy chat_members_select on public.chat_members for select to authenticated using (private.is_chat_member(conversation_id));
create policy chat_members_update on public.chat_members for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy chat_messages_select on public.chat_messages for select to authenticated using (private.is_chat_member(conversation_id));
create policy chat_messages_insert on public.chat_messages for insert to authenticated with check (author_id = (select auth.uid()) and private.is_chat_member(conversation_id));
create policy chat_messages_update on public.chat_messages for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
revoke all on public.chat_conversations, public.chat_members, public.chat_messages from anon;

-- Messages with author names (members may not otherwise see each other's profiles)
create or replace function public.chat_feed(p_conv uuid, p_after timestamptz default null)
returns table (id uuid, author_id uuid, author text, body text, created_at timestamptz, edited_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.author_id, trim(p.first_name || ' ' || p.last_name), m.body, m.created_at, m.edited_at
  from public.chat_messages m join public.profiles p on p.id = m.author_id
  where m.conversation_id = p_conv and m.deleted_at is null and private.is_chat_member(p_conv)
    and (p_after is null or m.created_at > p_after)
  order by m.created_at
  limit 500;
$$;
revoke execute on function public.chat_feed(uuid, timestamptz) from public, anon;
grant execute on function public.chat_feed(uuid, timestamptz) to authenticated;
