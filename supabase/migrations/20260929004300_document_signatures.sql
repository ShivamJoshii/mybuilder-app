-- Document e-signatures: send any PDF on a job to clients, subs or team members to sign, in order or all at once.
-- Each signature records name, typed/drawn mark, time, IP and browser. When everyone has signed, a signed copy
-- (original + certificate page with the document's SHA-256) is saved next to the original.

insert into public.app_notification_types (key, grp, module, label, sort) values
  ('signature.requested', 'Project Management', 'Files', 'A document is waiting for your signature', 55),
  ('signature.completed', 'Project Management', 'Files', 'Everyone signed a document you sent', 56),
  ('signature.declined',  'Project Management', 'Files', 'Someone declined to sign a document you sent', 57)
on conflict (key) do nothing;

create type public.sigreq_status as enum ('draft', 'sent', 'completed', 'declined', 'voided');

create table public.signature_requests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  job_id          uuid not null references public.jobs (id) on delete cascade,
  file_id         uuid not null references public.files (id) on delete restrict,
  file_version    int not null default 1,
  file_sha256     text,
  title           text not null check (length(title) between 1 and 200),
  message         text check (length(message) <= 4000),
  in_order        boolean not null default false,
  status          public.sigreq_status not null default 'draft',
  signed_file_id  uuid references public.files (id) on delete set null,
  signed_copy_error text,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  completed_at    timestamptz
);
create index signature_requests_job_idx on public.signature_requests (job_id);

create table public.signature_request_signers (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.signature_requests (id) on delete cascade,
  sort           int not null default 0,
  user_id        uuid references auth.users (id) on delete set null,
  sub_org_id     uuid references public.organizations (id) on delete cascade,
  label          text not null check (length(label) between 1 and 200),
  status         text not null default 'pending' check (status in ('pending', 'signed', 'declined')),
  signer_name    text,
  signed_by      uuid references auth.users (id) on delete set null,
  signature      text check (length(signature) <= 300000),
  comment        text check (length(comment) <= 4000),
  ip             text,
  user_agent     text,
  decided_at     timestamptz,
  check ((user_id is null) <> (sub_org_id is null))
);
create index signature_signers_req_idx on public.signature_request_signers (request_id);
create index signature_signers_user_idx on public.signature_request_signers (user_id);
create index signature_signers_sub_idx on public.signature_request_signers (sub_org_id);

alter table public.signature_requests enable row level security;
alter table public.signature_request_signers enable row level security;

create or replace function private.sigreq_row(p uuid)
returns public.signature_requests language sql stable security definer set search_path = '' as $$
  select * from public.signature_requests where id = p;
$$;

-- The caller is (one of) this signer row's people
create or replace function private.is_signer(p_user uuid, p_sub uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_user is not null and p_user = auth.uid())
      or (p_sub is not null and exists (select 1 from public.org_members m where m.org_id = p_sub and m.user_id = auth.uid() and m.status = 'active'));
$$;

create or replace function private.is_signer_user(p_uid uuid, p_user uuid, p_sub uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_user is not null and p_user = p_uid)
      or (p_sub is not null and exists (select 1 from public.org_members m where m.org_id = p_sub and m.user_id = p_uid and m.status = 'active'));
$$;

create or replace function private.can_see_sigreq(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.signature_requests r where r.id = p and (
    private.can_module(r.job_id, 'files', 'view')
    or (r.status <> 'draft' and exists (select 1 from public.signature_request_signers s where s.request_id = r.id and private.is_signer(s.user_id, s.sub_org_id)))));
$$;

create policy sigreq_select on public.signature_requests for select to authenticated using (
  private.can_module(job_id, 'files', 'view')
  or (status <> 'draft' and exists (select 1 from public.signature_request_signers s where s.request_id = signature_requests.id and private.is_signer(s.user_id, s.sub_org_id))));
create policy sigreq_insert on public.signature_requests for insert to authenticated with check (private.can_module(job_id, 'files', 'add'));
create policy sigreq_update on public.signature_requests for update to authenticated
  using (status = 'draft' and private.can_module(job_id, 'files', 'edit')) with check (status = 'draft');
create policy sigreq_delete on public.signature_requests for delete to authenticated using (status = 'draft' and private.can_module(job_id, 'files', 'delete'));
grant select, insert, update, delete on public.signature_requests to authenticated;

create policy signers_select on public.signature_request_signers for select to authenticated using (private.can_see_sigreq(request_id));
create policy signers_write on public.signature_request_signers for all to authenticated
  using ((private.sigreq_row(request_id)).status = 'draft' and private.can_module((private.sigreq_row(request_id)).job_id, 'files', 'edit'))
  with check ((private.sigreq_row(request_id)).status = 'draft' and private.can_module((private.sigreq_row(request_id)).job_id, 'files', 'edit'));
grant insert, update, delete on public.signature_request_signers to authenticated;
-- IP and browser are evidence for the sender, not for other signers
revoke select on public.signature_request_signers from authenticated, anon;
grant select (id, request_id, sort, user_id, sub_org_id, label, status, signer_name, signed_by, signature, comment, decided_at)
  on public.signature_request_signers to authenticated;

create or replace function public.signature_evidence(p_req uuid)
returns table (signer_id uuid, ip text, user_agent text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.ip, s.user_agent from public.signature_request_signers s join public.signature_requests r on r.id = s.request_id
  where s.request_id = p_req and private.can_module(r.job_id, 'files', 'view');
$$;
grant execute on function public.signature_evidence(uuid) to authenticated;

create or replace function private.sigreq_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare f public.files;
begin
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id; new.job_id := old.job_id; new.created_by := old.created_by; new.created_at := old.created_at;
    if current_setting('app.sigreq', true) is distinct from 'on' then
      new.status := old.status; new.sent_at := old.sent_at; new.completed_at := old.completed_at; new.signed_file_id := old.signed_file_id; new.file_sha256 := old.file_sha256; new.signed_copy_error := old.signed_copy_error;
    end if;
  else
    new.created_by := auth.uid(); new.status := 'draft'; new.sent_at := null; new.completed_at := null; new.signed_file_id := null; new.file_sha256 := null; new.signed_copy_error := null;
  end if;
  select * into f from public.files where id = new.file_id;
  if f.id is null or f.job_id is distinct from new.job_id or f.deleted_at is not null then raise exception 'Pick a file on this job' using errcode = '23514'; end if;
  if f.mime <> 'application/pdf' then raise exception 'Only PDF documents can be signed' using errcode = '22023'; end if;
  new.org_id := f.org_id;
  if tg_op = 'INSERT' or new.file_id is distinct from old.file_id then new.file_version := f.version; end if;
  return new;
end $$;
create trigger signature_requests_fill before insert or update on public.signature_requests for each row execute function private.sigreq_fill();

-- Signers must belong to the job: its team, clients, or subs
create or replace function private.signer_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.signature_requests;
begin
  r := private.sigreq_row(new.request_id);
  if tg_op = 'UPDATE' then
    new.request_id := old.request_id;
    if current_setting('app.sigreq', true) is distinct from 'on' then
      new.status := old.status; new.signer_name := old.signer_name; new.signed_by := old.signed_by; new.signature := old.signature;
      new.comment := old.comment; new.ip := old.ip; new.user_agent := old.user_agent; new.decided_at := old.decided_at;
    end if;
  else
    new.status := 'pending'; new.signed_by := null; new.signature := null; new.decided_at := null;
  end if;
  if new.sub_org_id is not null and not exists (select 1 from public.job_subs where job_id = r.job_id and sub_org_id = new.sub_org_id) then
    raise exception 'That sub is not on this job' using errcode = '23514';
  end if;
  if new.user_id is not null and not exists (select 1 from public.org_members where org_id = r.org_id and user_id = new.user_id and status = 'active')
     and not exists (select 1 from public.job_clients where job_id = r.job_id and user_id = new.user_id) then
    raise exception 'Signer is not on this job' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger signature_signers_check before insert or update on public.signature_request_signers for each row execute function private.signer_check();

-- The document itself is visible to its signers once sent
create or replace function private.sig_file_visible(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.signature_requests r join public.signature_request_signers s on s.request_id = r.id
                 where (r.file_id = p_file or r.signed_file_id = p_file) and r.status <> 'draft' and private.is_signer(s.user_id, s.sub_org_id));
$$;

alter policy files_select on public.files using (
  private.file_visible(org_id, job_id, share_subs, share_clients, uploaded_by, uploader_org, deleted_at)
  or (deleted_at is null and (private.bid_file_visible(id) or private.cert_file_visible(id) or private.sig_file_visible(id))));

create or replace function private.can_see_file(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.file_visible(f.org_id, f.job_id, f.share_subs, f.share_clients, f.uploaded_by, f.uploader_org, f.deleted_at)
                          or (f.deleted_at is null and (private.bid_file_visible(f.id) or private.cert_file_visible(f.id) or private.sig_file_visible(f.id)))
                   from public.files f where f.id = p_file), false);
$$;

-- Users a signer row notifies
create or replace function private.signer_users(s public.signature_request_signers)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select case when s.user_id is not null then array[s.user_id] else private.sub_users(s.sub_org_id) end;
$$;

-- Whose turn: all pending signers, or only the first pending one when signing in order
create or replace function private.sig_turn(p_req uuid)
returns setof public.signature_request_signers language sql stable security definer set search_path = '' as $$
  select s.* from public.signature_request_signers s join public.signature_requests r on r.id = s.request_id
  where s.request_id = p_req and s.status = 'pending'
    and (not r.in_order or s.sort = (select min(sort) from public.signature_request_signers x where x.request_id = p_req and x.status = 'pending'));
$$;

create or replace function public.send_signature_request(p_req uuid, p_sha256 text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.signature_requests; s public.signature_request_signers;
begin
  select * into r from public.signature_requests where id = p_req for update;
  if r.id is null or not private.can_module(r.job_id, 'files', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if r.status <> 'draft' then raise exception 'Already sent' using errcode = '22023'; end if;
  if not exists (select 1 from public.signature_request_signers where request_id = p_req) then raise exception 'Add at least one signer' using errcode = '23514'; end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Bad document hash' using errcode = '22023'; end if;
  perform set_config('app.sigreq', 'on', true);
  update public.signature_requests set status = 'sent', sent_at = now(), file_sha256 = p_sha256 where id = p_req;
  perform set_config('app.sigreq', 'off', true);
  for s in select * from private.sig_turn(p_req) loop
    perform private.notify(private.signer_users(s), r.org_id, r.job_id, 'signature.requested', 'Please sign: ' || r.title, r.message, '/signatures/' || r.id);
  end loop;
end $$;

-- Called by the server only (service role) with the verified user, IP and browser; signers can't forge the evidence
create or replace function public.sign_document(p_req uuid, p_user uuid, p_decision text, p_signer_name text, p_signature text, p_comment text default null, p_ip text default null, p_ua text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.signature_requests; s public.signature_request_signers; v_left int;
begin
  select * into r from public.signature_requests where id = p_req for update;
  if r.id is null or r.status <> 'sent' then raise exception 'This document is not open for signing' using errcode = '22023'; end if;
  if p_decision not in ('signed', 'declined') then raise exception 'Bad decision' using errcode = '22023'; end if;
  if length(trim(coalesce(p_signer_name, ''))) not between 1 and 120 then raise exception 'Enter your full name' using errcode = '23514'; end if;
  if p_decision = 'signed' and coalesce(p_signature, '') !~ '^(typed:.{1,120}|data:image/png;base64,[A-Za-z0-9+/]+=*)$' then
    raise exception 'A signature is required' using errcode = '23514';
  end if;
  select t.* into s from private.sig_turn(p_req) t where private.is_signer_user(p_user, t.user_id, t.sub_org_id) order by t.sort limit 1;
  if s.id is null then raise exception 'It is not your turn to sign this document' using errcode = '42501'; end if;
  perform set_config('app.sigreq', 'on', true);
  update public.signature_request_signers set status = p_decision, signer_name = trim(p_signer_name), signed_by = p_user,
    signature = case when p_decision = 'signed' then p_signature end, comment = left(p_comment, 4000), ip = left(p_ip, 100), user_agent = left(p_ua, 400), decided_at = now()
  where id = s.id;
  if p_decision = 'declined' then
    update public.signature_requests set status = 'declined' where id = p_req;
    perform private.notify(array[r.created_by], r.org_id, r.job_id, 'signature.declined', trim(p_signer_name) || ' declined: ' || r.title, p_comment, '/signatures/' || r.id);
  else
    select count(*) into v_left from public.signature_request_signers where request_id = p_req and status = 'pending';
    if v_left = 0 then
      update public.signature_requests set status = 'completed', completed_at = now() where id = p_req;
      perform private.notify(array[r.created_by], r.org_id, r.job_id, 'signature.completed', 'Everyone signed: ' || r.title, null, '/signatures/' || r.id);
    elsif r.in_order then
      for s in select * from private.sig_turn(p_req) loop
        perform private.notify(private.signer_users(s), r.org_id, r.job_id, 'signature.requested', 'Please sign: ' || r.title, r.message, '/signatures/' || r.id);
      end loop;
    end if;
  end if;
  perform set_config('app.sigreq', 'off', true);
  return (select status::text from public.signature_requests where id = p_req);
end $$;
revoke execute on function public.sign_document(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.sign_document(uuid, uuid, text, text, text, text, text, text) to service_role;

create or replace function public.void_signature_request(p_req uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.signature_requests;
begin
  select * into r from public.signature_requests where id = p_req for update;
  if r.id is null or not private.can_module(r.job_id, 'files', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if r.status not in ('sent', 'declined') then raise exception 'Only open requests can be voided' using errcode = '22023'; end if;
  perform set_config('app.sigreq', 'on', true);
  update public.signature_requests set status = 'voided' where id = p_req;
  perform set_config('app.sigreq', 'off', true);
end $$;

-- Server (service role) attaches the generated signed copy
create or replace function public.attach_signed_copy(p_req uuid, p_file uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.sigreq', 'on', true);
  update public.signature_requests set signed_file_id = p_file where id = p_req and status = 'completed' and signed_file_id is null;
  perform set_config('app.sigreq', 'off', true);
end $$;
create or replace function public.signed_copy_failed(p_req uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.sigreq', 'on', true);
  update public.signature_requests set signed_copy_error = left(p_reason, 500) where id = p_req;
  perform set_config('app.sigreq', 'off', true);
end $$;
revoke execute on function public.signed_copy_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.signed_copy_failed(uuid, text) to service_role;
revoke execute on function public.attach_signed_copy(uuid, uuid) from public, anon, authenticated;
grant execute on function public.attach_signed_copy(uuid, uuid) to service_role;

-- Files the server creates (signed copies) are the builder's
create or replace function private.file_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare f public.file_folders;
begin
  select * into f from public.file_folders where id = new.folder_id;
  if f.id is null then raise exception 'Folder not found' using errcode = '23503'; end if;
  if tg_op = 'UPDATE' and new.folder_id is distinct from old.folder_id
     and (f.org_id is distinct from old.org_id or f.job_id is distinct from old.job_id) then
    raise exception 'Files can only move between folders of the same job' using errcode = '23514';
  end if;
  new.org_id := f.org_id; new.job_id := f.job_id; new.kind := f.kind;
  if tg_op = 'INSERT' then
    new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);   -- the server passes the requester
    if f.job_id is null or auth.uid() is null or private.is_job_internal(f.job_id) then  -- server-made files (no user) count as the builder's
      new.uploader_type := 'internal'; new.uploader_org := null;
    elsif private.is_job_sub(f.job_id) then
      new.uploader_type := 'sub'; new.uploader_org := private.my_sub_on_job(f.job_id);
    else
      new.uploader_type := 'client'; new.uploader_org := null;
    end if;
    new.share_subs := new.share_subs or f.share_subs;
    new.share_clients := new.share_clients or f.share_clients;
  else
    new.id := old.id;
    if (new.version is distinct from old.version or new.storage_key is distinct from old.storage_key or new.folder_id is distinct from old.folder_id or new.deleted_at is distinct from old.deleted_at)
       and exists (select 1 from public.signature_requests r where r.file_id = old.id and r.status = 'sent') then
      raise exception 'This document is out for signature. Void the request before changing it.' using errcode = '55000';
    end if;
    new.uploaded_by := old.uploaded_by; new.uploader_type := old.uploader_type; new.uploader_org := old.uploader_org;
    if new.version < old.version then new.version := old.version; end if;
    new.storage_key := case when new.version > old.version then new.storage_key else old.storage_key end;
  end if;
  if new.storage_key is distinct from coalesce(old.storage_key, '') or tg_op = 'INSERT' then
    if left(new.storage_key, length(new.org_id::text || '/' || coalesce(new.job_id::text, 'global') || '/' || new.id::text || '/v' || new.version || '/'))
       is distinct from new.org_id::text || '/' || coalesce(new.job_id::text, 'global') || '/' || new.id::text || '/v' || new.version || '/' then
      raise exception 'Bad storage key' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

grant execute on all functions in schema private to authenticated;

-- Is it the caller's turn to sign? (for the page)
create or replace function public.my_signature_turn(p_req uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.sig_turn(p_req) t where private.is_signer(t.user_id, t.sub_org_id));
$$;
grant execute on function public.my_signature_turn(uuid) to authenticated;

-- Server-only helpers stay server-only (the blanket grant above re-adds them)
revoke execute on function private.run_reminders(timestamptz) from authenticated;
revoke execute on function private.remind(uuid[], text, uuid, text, uuid, uuid, text, text, text) from authenticated;
revoke execute on function private.notify(uuid[], uuid, uuid, text, text, text, text) from authenticated;
