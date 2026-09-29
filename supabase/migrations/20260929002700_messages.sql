-- =====================================================================
-- Messages: job email. Every job has its own inbound address
-- (job-<token>@<inbound domain>); outgoing mail sets Reply-To to it so
-- replies land back on the job. Only the builder's team reads job mail.
-- =====================================================================
create table public.job_mailboxes (
  job_id  uuid primary key references public.jobs (id) on delete cascade,
  org_id  uuid not null references public.organizations (id) on delete cascade,
  token   text not null unique default encode(extensions.gen_random_bytes(8), 'hex')
);
insert into public.job_mailboxes (job_id, org_id) select id, org_id from public.jobs on conflict do nothing;
create or replace function private.job_mailbox()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.job_mailboxes (job_id, org_id) values (new.id, new.org_id) on conflict do nothing;
  return null;
end $$;
create trigger jobs_mailbox after insert on public.jobs for each row execute function private.job_mailbox();

create table public.email_threads (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  job_id      uuid not null references public.jobs (id) on delete cascade,
  subject     text not null check (length(subject) <= 300),
  last_at     timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index email_threads_job on public.email_threads (job_id, last_at desc);
create trigger email_threads_fill before insert on public.email_threads for each row execute function private.fill_org_from_job();

create table public.email_messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.email_threads (id) on delete cascade,
  direction    text not null check (direction in ('out', 'in')),
  from_email   text not null check (length(from_email) <= 320),
  from_name    text check (length(from_name) <= 200),
  to_emails    text[] not null default '{}',
  cc_emails    text[] not null default '{}',
  subject      text not null check (length(subject) <= 300),
  body_text    text not null default '' check (length(body_text) <= 200000),
  message_id   text unique,
  in_reply_to  text,
  status       text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'received')),
  error        text,
  sent_by      uuid references public.profiles (id) on delete set null,
  attachments  int not null default 0,
  created_at   timestamptz not null default now()
);
create index email_messages_thread on public.email_messages (thread_id, created_at);

create or replace function private.thread_job(p uuid)
returns uuid language sql stable security definer set search_path = '' as $$ select job_id from public.email_threads where id = p $$;
grant execute on function private.thread_job(uuid) to authenticated;

create or replace function private.email_touch_thread()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.email_threads set last_at = new.created_at where id = new.thread_id;
  return null;
end $$;
create trigger email_messages_touch after insert on public.email_messages for each row execute function private.email_touch_thread();

-- Inbound mail (called by the webhook with the service role only)
create or replace function public.ingest_inbound_email(p_token text, p_from text, p_from_name text, p_to text[], p_cc text[], p_subject text,
  p_body text, p_message_id text, p_in_reply_to text, p_attachments int default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare mb public.job_mailboxes; v_thread uuid; v_subject text; v_id uuid;
begin
  p_message_id := nullif(trim(p_message_id), ''); p_in_reply_to := nullif(trim(p_in_reply_to), '');
  select * into mb from public.job_mailboxes where token = lower(p_token);
  if mb.job_id is null then return null; end if;
  if p_message_id is not null and exists (select 1 from public.email_messages where message_id = p_message_id) then return null; end if;
  v_subject := left(coalesce(nullif(trim(p_subject), ''), '(no subject)'), 300);
  if p_in_reply_to is not null then
    select m.thread_id into v_thread from public.email_messages m join public.email_threads t on t.id = m.thread_id
    where m.message_id = p_in_reply_to and t.job_id = mb.job_id limit 1;
  end if;
  if v_thread is null then
    select id into v_thread from public.email_threads
    where job_id = mb.job_id and lower(regexp_replace(subject, '^((re|fwd?|fw):\s*)+', '', 'i')) = lower(regexp_replace(v_subject, '^((re|fwd?|fw):\s*)+', '', 'i'))
    order by last_at desc limit 1;
  end if;
  if v_thread is null then
    insert into public.email_threads (org_id, job_id, subject) values (mb.org_id, mb.job_id, v_subject) returning id into v_thread;
  end if;
  insert into public.email_messages (thread_id, direction, from_email, from_name, to_emails, cc_emails, subject, body_text, message_id, in_reply_to, status, attachments)
  values (v_thread, 'in', lower(p_from), p_from_name, coalesce(p_to, '{}'), coalesce(p_cc, '{}'), v_subject, left(coalesce(p_body, ''), 200000), p_message_id, p_in_reply_to, 'received', coalesce(p_attachments, 0))
  returning id into v_id;
  perform private.notify(coalesce((select array_agg(user_id) from public.job_managers where job_id = mb.job_id), (select array[created_by] from public.jobs where id = mb.job_id)),
    mb.org_id, mb.job_id, 'message.received', 'Email from ' || coalesce(nullif(p_from_name, ''), p_from), v_subject, '/messages/' || v_thread);
  return v_id;
end $$;
revoke execute on function public.ingest_inbound_email(text, text, text, text[], text[], text, text, text, text, int) from public, anon, authenticated;
grant execute on function public.ingest_inbound_email(text, text, text, text[], text[], text, text, text, text, int) to service_role;

-- ('message.received' was seeded with the notifications engine)

alter table public.job_mailboxes enable row level security;
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;
create policy mailbox_select on public.job_mailboxes for select to authenticated using (private.can_module(job_id, 'messages', 'view'));
create policy threads_select on public.email_threads for select to authenticated using (private.can_module(job_id, 'messages', 'view'));
create policy threads_insert on public.email_threads for insert to authenticated with check (private.can_module(job_id, 'messages', 'add'));
create policy emails_select on public.email_messages for select to authenticated using (private.can_module(private.thread_job(thread_id), 'messages', 'view'));
create policy emails_insert on public.email_messages for insert to authenticated
  with check (direction = 'out' and sent_by = (select auth.uid()) and status = 'queued' and private.can_module(private.thread_job(thread_id), 'messages', 'add'));
create policy emails_update on public.email_messages for update to authenticated
  using (direction = 'out' and sent_by = (select auth.uid())) with check (direction = 'out' and sent_by = (select auth.uid()));
revoke all on public.job_mailboxes, public.email_threads, public.email_messages from anon;
