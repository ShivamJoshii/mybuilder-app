-- =====================================================================
-- Files: documents, photos, videos in folders; per-audience sharing,
-- versions, trash, public share links, and attachments on any record.
-- Bytes live in object storage (R2 in production); rows hold metadata.
-- =====================================================================

create type public.file_kind as enum ('documents', 'photos', 'videos');
create type public.file_status as enum ('pending', 'ready');

create table public.file_folders (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  job_id        uuid references public.jobs (id) on delete cascade,     -- null = global (company-wide) folder
  kind          public.file_kind not null,
  name          text not null check (length(trim(name)) between 1 and 120),
  system_key    text,           -- 'sub_uploads' | 'attachments'
  share_subs    boolean not null default false,
  share_clients boolean not null default false,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index file_folders_job on public.file_folders (job_id, kind) where deleted_at is null;
create unique index file_folders_system on public.file_folders (coalesce(job_id, org_id), kind, system_key) where system_key is not null;
create trigger file_folders_touch before update on public.file_folders for each row execute function private.touch_updated_at();

create table public.files (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  job_id         uuid references public.jobs (id) on delete cascade,
  folder_id      uuid not null references public.file_folders (id) on delete cascade,
  kind           public.file_kind not null,
  name           text not null check (length(trim(name)) between 1 and 255),
  mime           text not null default 'application/octet-stream',
  size_bytes     bigint not null default 0 check (size_bytes >= 0),
  storage_key    text not null unique,
  status         public.file_status not null default 'pending',
  version        int not null default 1,
  share_subs     boolean not null default false,
  share_clients  boolean not null default false,
  uploaded_by    uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  uploader_type  text not null default 'internal' check (uploader_type in ('internal', 'sub', 'client')),
  uploader_org   uuid references public.organizations (id) on delete set null,   -- sub company that uploaded
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index files_folder on public.files (folder_id) where deleted_at is null;
create index files_job on public.files (job_id, kind) where deleted_at is null;
create trigger files_touch before update on public.files for each row execute function private.touch_updated_at();

create table public.file_versions (
  id           uuid primary key default gen_random_uuid(),
  file_id      uuid not null references public.files (id) on delete cascade,
  version      int not null,
  storage_key  text not null unique,
  size_bytes   bigint not null,
  mime         text not null,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (file_id, version)
);

create table public.file_share_links (
  id          uuid primary key default gen_random_uuid(),
  file_id     uuid not null references public.files (id) on delete cascade,
  token       text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  revoked_at  timestamptz
);

create table public.record_attachments (
  file_id      uuid not null references public.files (id) on delete cascade,
  record_type  text not null check (record_type ~ '^[a-z_]{2,40}$'),
  record_id    uuid not null,
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (file_id, record_type, record_id)
);
create index record_attachments_record on public.record_attachments (record_type, record_id);

-- ---------------------------------------------------------------------
-- Who is uploading: internal / sub (with company) / client
-- ---------------------------------------------------------------------
create or replace function private.file_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare f public.file_folders;
begin
  select * into f from public.file_folders where id = new.folder_id;
  if f.id is null then raise exception 'Folder not found' using errcode = '23503'; end if;
  new.org_id := f.org_id; new.job_id := f.job_id; new.kind := f.kind;
  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
    if f.job_id is null or private.is_job_internal(f.job_id) then
      new.uploader_type := 'internal'; new.uploader_org := null;
    elsif private.is_job_sub(f.job_id) then
      new.uploader_type := 'sub'; new.uploader_org := private.my_sub_on_job(f.job_id);
    else
      new.uploader_type := 'client'; new.uploader_org := null;
    end if;
    -- new files inherit the folder's sharing unless set explicitly
    new.share_subs := new.share_subs or f.share_subs;
    new.share_clients := new.share_clients or f.share_clients;
  else
    new.uploaded_by := old.uploaded_by; new.uploader_type := old.uploader_type; new.uploader_org := old.uploader_org;
    new.storage_key := case when new.version > old.version then new.storage_key else old.storage_key end;
  end if;
  return new;
end $$;
create trigger files_fill before insert or update on public.files for each row execute function private.file_fill();

create or replace function private.folder_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.job_id is not null then select org_id into new.org_id from public.jobs where id = new.job_id; end if;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger file_folders_fill before insert on public.file_folders for each row execute function private.folder_fill();

-- ---------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------
create or replace function private.folder_visible(p_org uuid, p_job uuid, p_subs boolean, p_clients boolean, p_system text, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and case
    when p_job is null then
      (private.is_member(p_org) and private.has_perm(p_org, 'files', 'view'))
      or (p_subs and private.is_linked_sub_of(p_org))
      or (p_clients and private.is_client_of(p_org))
    else
      private.can_module(p_job, 'files', 'view')
      or (private.is_job_sub(p_job) and (p_subs or p_system = 'sub_uploads'))
      or (private.is_job_client(p_job) and p_clients)
  end;
$$;

create or replace function private.file_visible(p_org uuid, p_job uuid, p_subs boolean, p_clients boolean, p_uploader uuid, p_uploader_org uuid, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_uploader = auth.uid()
    or (p_deleted is null and case
      when p_job is null then
        (private.is_member(p_org) and private.has_perm(p_org, 'files', 'view'))
        or (p_subs and private.is_linked_sub_of(p_org))
        or (p_clients and private.is_client_of(p_org))
      else
        private.can_module(p_job, 'files', 'view')
        or (private.is_job_sub(p_job) and (p_subs or p_uploader_org = private.my_sub_on_job(p_job)))
        or (private.is_job_client(p_job) and p_clients)
    end);
$$;

create or replace function private.can_see_file(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.file_visible(f.org_id, f.job_id, f.share_subs, f.share_clients, f.uploaded_by, f.uploader_org, f.deleted_at)
                   from public.files f where f.id = p_file), false);
$$;

-- Can the caller add files to this folder?
create or replace function private.can_upload_to(p_folder uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.file_folders f where f.id = p_folder and f.deleted_at is null and (
      (f.job_id is null and private.has_perm(f.org_id, 'files', 'add'))
      or (f.job_id is not null and private.can_module(f.job_id, 'files', 'add'))
      or (f.job_id is not null and private.is_job_sub(f.job_id) and f.system_key in ('sub_uploads', 'attachments'))
      or (f.job_id is not null and private.is_job_client(f.job_id) and f.system_key = 'attachments')));
$$;

grant execute on function private.folder_visible(uuid, uuid, boolean, boolean, text, timestamptz),
  private.file_visible(uuid, uuid, boolean, boolean, uuid, uuid, timestamptz), private.can_see_file(uuid), private.can_upload_to(uuid) to authenticated;

-- System folders per job and kind: "Sub and vendor uploaded files" + hidden "Attachments"
create or replace function private.ensure_system_folders(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare k public.file_kind; v_org uuid;
begin
  select org_id into v_org from public.jobs where id = p_job;
  foreach k in array array['documents', 'photos', 'videos']::public.file_kind[] loop
    insert into public.file_folders (org_id, job_id, kind, name, system_key)
    values (v_org, p_job, k, 'Sub and vendor uploaded files', 'sub_uploads') on conflict do nothing;
  end loop;
  insert into public.file_folders (org_id, job_id, kind, name, system_key)
  values (v_org, p_job, 'documents', 'Attachments', 'attachments') on conflict do nothing;
end $$;

create or replace function private.after_job_folders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.ensure_system_folders(new.id);
  return null;
end $$;
create trigger jobs_system_folders after insert on public.jobs for each row execute function private.after_job_folders();
do $$ declare j record; begin for j in select id from public.jobs loop perform private.ensure_system_folders(j.id); end loop; end $$;

-- Global "Global Documents" folder per builder
create or replace function private.after_org_folders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'builder' then
    insert into public.file_folders (org_id, job_id, kind, name, system_key) values
      (new.id, null, 'documents', 'Global Documents', 'global'), (new.id, null, 'videos', 'Global Videos', 'global')
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger organizations_global_folders after insert on public.organizations for each row execute function private.after_org_folders();

-- Public share link lookup (server signs a download URL for the returned key)
create or replace function public.resolve_share_link(p_token text)
returns table (name text, mime text, storage_key text, size_bytes bigint) language sql stable security definer set search_path = '' as $$
  select f.name, f.mime, f.storage_key, f.size_bytes
  from public.file_share_links l join public.files f on f.id = l.file_id
  where l.token = p_token and l.revoked_at is null and (l.expires_at is null or l.expires_at > now())
    and f.deleted_at is null and f.status = 'ready';
$$;
revoke execute on function public.resolve_share_link(text) from public;
grant execute on function public.resolve_share_link(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.file_folders enable row level security;
alter table public.files enable row level security;
alter table public.file_versions enable row level security;
alter table public.file_share_links enable row level security;
alter table public.record_attachments enable row level security;

create policy folders_select on public.file_folders for select to authenticated
  using (private.folder_visible(org_id, job_id, share_subs, share_clients, system_key, deleted_at));
create policy folders_insert on public.file_folders for insert to authenticated
  with check (system_key is null and ((job_id is null and private.has_perm(org_id, 'files', 'add')) or (job_id is not null and private.can_module(job_id, 'files', 'add'))));
create policy folders_update on public.file_folders for update to authenticated
  using ((job_id is null and private.has_perm(org_id, 'files', 'edit')) or (job_id is not null and private.can_module(job_id, 'files', 'edit')))
  with check ((job_id is null and private.has_perm(org_id, 'files', 'edit')) or (job_id is not null and private.can_module(job_id, 'files', 'edit')));

create policy files_select on public.files for select to authenticated
  using (private.file_visible(org_id, job_id, share_subs, share_clients, uploaded_by, uploader_org, deleted_at));
create policy files_insert on public.files for insert to authenticated
  with check (private.can_upload_to(folder_id));
create policy files_update on public.files for update to authenticated
  using (uploaded_by = (select auth.uid())
      or (job_id is null and private.has_perm(org_id, 'files', 'edit'))
      or (job_id is not null and private.can_module(job_id, 'files', 'edit')))
  with check (private.can_upload_to(folder_id) or uploaded_by = (select auth.uid())
      or (job_id is null and private.has_perm(org_id, 'files', 'edit'))
      or (job_id is not null and private.can_module(job_id, 'files', 'edit')));

create policy versions_select on public.file_versions for select to authenticated using (private.can_see_file(file_id));
create policy versions_insert on public.file_versions for insert to authenticated with check (private.can_see_file(file_id));

create policy share_select on public.file_share_links for select to authenticated using (private.can_see_file(file_id));
create policy share_insert on public.file_share_links for insert to authenticated
  with check (created_by = (select auth.uid()) and private.can_see_file(file_id)
              and exists (select 1 from public.files f where f.id = file_id and (f.job_id is null or private.is_job_internal(f.job_id))));
create policy share_update on public.file_share_links for update to authenticated
  using (created_by = (select auth.uid()) or exists (select 1 from public.files f where f.id = file_id and f.job_id is not null and private.can_module(f.job_id, 'files', 'edit')))
  with check (true);

create policy attach_select on public.record_attachments for select to authenticated using (private.can_see_file(file_id));
create policy attach_insert on public.record_attachments for insert to authenticated with check (created_by = (select auth.uid()) and private.can_see_file(file_id));
create policy attach_delete on public.record_attachments for delete to authenticated using (created_by = (select auth.uid()));

create trigger audit_files after insert or update or delete on public.files for each row execute function private.audit();
revoke all on public.file_folders, public.files, public.file_versions, public.file_share_links, public.record_attachments from anon;

-- The app talks to storage with its own S3 credentials; nobody reads the bucket directly
-- (no storage.objects policies are granted to anon/authenticated).
