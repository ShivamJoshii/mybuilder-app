-- Security hardening from the September audit. Each block names the finding it closes.

-- =====================================================================
-- 1. Invites can only come from the definer RPCs; accept_invite re-checks everything
-- =====================================================================
drop policy if exists invites_insert on public.invites;

create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_i public.invites; v_email text; v_all boolean; v_has_admin boolean; v_active uuid; v_jc public.job_clients;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select * into v_i from public.invites where token = p_token for update;
  if v_i.id is null then raise exception 'Invite not found' using errcode = 'P0002'; end if;
  if v_i.accepted_at is not null then raise exception 'Invite already used' using errcode = '23505'; end if;
  if v_i.expires_at < now() then raise exception 'Invite expired' using errcode = '22023'; end if;
  select email into v_email from auth.users where id = auth.uid();
  if lower(v_email) <> lower(v_i.email::text) then
    raise exception 'This invite was sent to a different email' using errcode = '42501';
  end if;

  if v_i.kind = 'internal' then
    if not exists (select 1 from public.roles where id = v_i.role_id and org_id = v_i.org_id) then
      raise exception 'Invite is no longer valid' using errcode = '22023';
    end if;
    select all_jobs_default into v_all from public.roles where id = v_i.role_id;
    insert into public.org_members (org_id, user_id, role_id, all_jobs)
    values (v_i.org_id, auth.uid(), v_i.role_id, coalesce(v_all, false))
    on conflict (org_id, user_id) do update set role_id = excluded.role_id, status = 'active';
    v_active := v_i.org_id;
  elsif v_i.kind = 'sub' then
    -- the inviting builder must have a link to this sub company
    if not exists (select 1 from public.builder_sub_links where builder_org_id = v_i.org_id and sub_org_id = v_i.sub_org_id) then
      raise exception 'Invite is no longer valid' using errcode = '22023';
    end if;
    select exists (select 1 from public.org_members where org_id = v_i.sub_org_id and is_admin and status = 'active') into v_has_admin;
    if v_has_admin then
      -- an established company: only its own admins can accept a builder's connection
      if not exists (select 1 from public.org_members where org_id = v_i.sub_org_id and user_id = auth.uid() and is_admin and status = 'active') then
        raise exception 'Ask an admin of your company to accept this invite' using errcode = '42501';
      end if;
    else
      insert into public.org_members (org_id, user_id, is_admin)
      values (v_i.sub_org_id, auth.uid(), true)
      on conflict (org_id, user_id) do update set status = 'active', is_admin = true;
    end if;
    perform set_config('app.link_accept', 'on', true);
    update public.builder_sub_links set status = 'active'
      where builder_org_id = v_i.org_id and sub_org_id = v_i.sub_org_id and status = 'pending';
    perform set_config('app.link_accept', 'off', true);
    v_active := v_i.sub_org_id;
  else
    select * into v_jc from public.job_clients where id = v_i.job_client_id for update;
    if v_jc.id is null or private.job_org(v_jc.job_id) is distinct from v_i.org_id then
      raise exception 'Invite is no longer valid' using errcode = '22023';
    end if;
    if v_jc.user_id is not null and v_jc.user_id <> auth.uid() then
      raise exception 'This contact already has an account' using errcode = '23505';
    end if;
    update public.job_clients set user_id = auth.uid() where id = v_jc.id;
    v_active := v_i.org_id;
  end if;

  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = v_i.id;
  insert into public.user_state (user_id, active_org_id) values (auth.uid(), v_active)
    on conflict (user_id) do update set active_org_id = excluded.active_org_id, updated_at = now();
  return v_active;
end $$;

-- =====================================================================
-- 2. Sub linking: match on the verified login email, pending until the sub accepts
-- =====================================================================
-- profiles.email mirrors auth.users; users cannot change it through the API
create or replace function private.profile_email_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then new.email := old.email; end if;
  return new;
end $$;
create trigger profiles_email_lock before update on public.profiles
  for each row execute function private.profile_email_lock();

drop policy if exists links_insert on public.builder_sub_links;

-- A pending link only turns active through accept_invite; the org pair never changes
create or replace function private.link_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.builder_org_id := old.builder_org_id; new.sub_org_id := old.sub_org_id;
  if current_setting('app.link_accept', true) is distinct from 'on' then
    if old.status = 'pending' and new.status = 'active' then new.status := 'pending'; end if;
    if new.status = 'pending' and old.status <> 'pending' then new.status := old.status; end if;
  end if;
  return new;
end $$;
create trigger builder_sub_links_guard before update on public.builder_sub_links
  for each row execute function private.link_guard();

create or replace function public.add_sub_vendor(p_builder uuid, p_company_name text, p_email text, p_trade text default null,
  p_contact_first text default null, p_contact_last text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_sub uuid; v_link uuid; v_email extensions.citext := lower(trim(p_email)); v_new boolean := false; v_status public.link_status;
begin
  if not private.has_perm(p_builder, 'subs_vendors', 'add') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- an existing company whose admin signs in with this (verified) email
  select m.org_id into v_sub
  from public.org_members m
  join public.organizations o on o.id = m.org_id and o.kind = 'sub'
  join auth.users u on u.id = m.user_id
  where lower(u.email) = lower(v_email::text) and m.is_admin and m.status = 'active'
  order by m.joined_at limit 1;

  if v_sub is null then
    insert into public.organizations (kind, name, email, created_by)
    values ('sub', trim(p_company_name), v_email, auth.uid()) returning id into v_sub;
    v_new := true;
  end if;

  insert into public.builder_sub_links (builder_org_id, sub_org_id, trade, company_name, primary_contact_first,
                                        primary_contact_last, business_phone, primary_email, status)
  values (p_builder, v_sub, p_trade, trim(p_company_name), p_contact_first, p_contact_last, p_phone, v_email,
          case when v_new then 'active' else 'pending' end::public.link_status)
  on conflict (builder_org_id, sub_org_id) do update
    set status = case when public.builder_sub_links.status = 'inactive' then 'active'::public.link_status else public.builder_sub_links.status end,
        updated_at = now()
  returning id, status into v_link, v_status;

  -- invite: always for a pending link (the sub's admin accepts), else when nobody with this email is in the company yet
  if v_status = 'pending' or not exists (select 1 from public.org_members m join auth.users u on u.id = m.user_id
                                         where m.org_id = v_sub and lower(u.email) = lower(v_email::text)) then
    if not exists (select 1 from public.invites where org_id = p_builder and kind = 'sub' and sub_org_id = v_sub
                   and email = v_email and accepted_at is null and expires_at > now()) then
      insert into public.invites (org_id, kind, email, sub_org_id, invited_by)
      values (p_builder, 'sub', v_email, v_sub, auth.uid());
    end if;
  end if;
  return v_link;
end $$;

-- A pending link does not let the builder see the company's people
create or replace function private.is_linked_builder_of(p_sub uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.builder_sub_links l
    join public.org_members m on m.org_id = l.builder_org_id and m.user_id = auth.uid() and m.status = 'active'
    where l.sub_org_id = p_sub and l.status <> 'pending'
  );
$$;

create or replace function private.can_see_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid()
      or exists (
        select 1 from public.org_members a
        join public.org_members b on b.org_id = a.org_id
        where a.user_id = auth.uid() and a.status = 'active' and b.user_id = p_user)
      or exists (
        select 1 from public.builder_sub_links l
        join public.org_members a on a.user_id = auth.uid() and a.status = 'active'
                                 and a.org_id in (l.builder_org_id, l.sub_org_id)
        join public.org_members b on b.user_id = p_user
                                 and b.org_id in (l.builder_org_id, l.sub_org_id)
        where l.status <> 'pending')
      or exists (
        select 1 from public.job_clients c
        where c.user_id = p_user and private.is_job_internal(c.job_id))
      or exists (
        select 1 from public.job_clients c
        join public.jobs j on j.id = c.job_id
        join public.org_members m on m.org_id = j.org_id and m.user_id = p_user
        where c.user_id = auth.uid());
$$;

-- Memberships are only created by accept_invite / org creation (definer functions)
drop policy if exists org_members_insert on public.org_members;

-- =====================================================================
-- 3. Share links cannot be repointed at another file
-- =====================================================================
create or replace function private.share_link_freeze()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.file_id := old.file_id; new.created_by := old.created_by;
  return new;
end $$;
create trigger file_share_links_freeze before update on public.file_share_links
  for each row execute function private.share_link_freeze();

alter policy share_update on public.file_share_links with check (
  (created_by = (select auth.uid()))
  or exists (select 1 from public.files f where f.id = file_share_links.file_id and f.job_id is not null
             and private.can_module(f.job_id, 'files', 'edit')));

-- =====================================================================
-- 4. Storage keys must live under the record's own prefix
-- =====================================================================
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
    new.uploaded_by := auth.uid();
    if f.job_id is null or private.is_job_internal(f.job_id) then
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

-- Old versions are copies of the file's current key, nothing else
create or replace function private.file_version_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare f public.files;
begin
  select * into f from public.files where id = new.file_id;
  if f.id is null then raise exception 'File not found' using errcode = '23503'; end if;
  new.storage_key := f.storage_key; new.version := f.version; new.size_bytes := f.size_bytes; new.mime := f.mime; new.uploaded_by := auth.uid();
  return new;
end $$;
create trigger file_versions_fill before insert on public.file_versions
  for each row execute function private.file_version_fill();

alter policy versions_insert on public.file_versions with check (
  exists (select 1 from public.files f where f.id = file_versions.file_id
          and (f.uploaded_by = (select auth.uid())
               or (f.job_id is null and private.has_perm(f.org_id, 'files', 'edit'))
               or (f.job_id is not null and private.can_module(f.job_id, 'files', 'edit')))));

-- Plan sheet versions: key under the sheet's org/job; sheet and key fixed after insert
create or replace function private.sheet_version_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.plan_sheets; v_prefix text;
begin
  if tg_op = 'UPDATE' then
    new.sheet_id := old.sheet_id; new.storage_key := old.storage_key; new.version := old.version; new.uploaded_by := old.uploaded_by;
    return new;
  end if;
  select * into s from public.plan_sheets where id = new.sheet_id;
  v_prefix := s.org_id::text || '/' || s.job_id::text || '/';
  if s.id is null or left(new.storage_key, length(v_prefix)) is distinct from v_prefix then
    raise exception 'Bad storage key' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger plan_sheet_versions_fill before insert or update on public.plan_sheet_versions
  for each row execute function private.sheet_version_fill();

-- Logos: only the org's own branding folder
create or replace function private.org_logo_check()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.logo_url is distinct from old.logo_url and new.logo_url is not null
     and left(new.logo_url, length('storage:' || new.id::text || '/branding/')) is distinct from 'storage:' || new.id::text || '/branding/' then
    raise exception 'Bad logo' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger organizations_logo_check before update on public.organizations
  for each row execute function private.org_logo_check();

-- =====================================================================
-- 5. Proposals stay on their job, and their estimate belongs to it
-- =====================================================================
create or replace function private.proposal_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.job_id := old.job_id; new.org_id := old.org_id; new.estimate_id := old.estimate_id; new.created_by := old.created_by;
    return new;
  end if;
  select org_id into new.org_id from public.jobs where id = new.job_id;
  if new.estimate_id is not null and not exists (select 1 from public.estimates e where e.id = new.estimate_id and e.job_id = new.job_id) then
    raise exception 'Estimate is on another job' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists proposals_fill on public.proposals;
create trigger proposals_fill before insert or update on public.proposals
  for each row execute function private.proposal_fill();

-- =====================================================================
-- 6. Subs cannot change holdback or lien waiver terms on their bills
-- =====================================================================
create or replace function private.bill_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare po public.purchase_orders; v_internal boolean;
begin
  if tg_op = 'INSERT' then
    select org_id into new.org_id from public.jobs where id = new.job_id;
    perform pg_advisory_xact_lock(hashtext('bill:' || new.job_id::text));
    select coalesce(max(number), 0) + 1 into new.number from public.bills where job_id = new.job_id;
    new.created_by := auth.uid(); new.approved_at := null; new.approved_by := null; new.paid_at := null; new.paid_amount := null;
    new.lien_waiver_received_at := null;
    v_internal := private.bill_internal(new.job_id, new.org_id, 'add');
    if not v_internal then new.is_holdback_release := false; end if;
    if new.po_id is not null then
      select * into po from public.purchase_orders where id = new.po_id;
      if po.job_id is distinct from new.job_id then raise exception 'PO is on another job' using errcode = '23514'; end if;
      if po.status <> 'accepted' then raise exception 'Bill against an accepted purchase order' using errcode = '22023'; end if;
      new.sub_org_id := po.sub_org_id; new.vendor_name := po.vendor_name;
      if v_internal then
        new.lien_waiver_required := new.lien_waiver_required or po.lien_waiver_required;
        if not new.is_holdback_release then new.holdback_pct := po.holdback_pct; end if;
      else
        new.lien_waiver_required := po.lien_waiver_required; new.holdback_pct := po.holdback_pct;
      end if;
    end if;
    if v_internal then
      new.submitted_by_sub := false;
      if new.status not in ('draft', 'approved') then new.status := 'draft'; end if;
      if new.status = 'approved' then new.approved_at := now(); new.approved_by := auth.uid(); end if;
    else
      if new.po_id is null or not private.is_my_linked_sub(new.org_id, new.sub_org_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
      new.submitted_by_sub := true; new.status := 'submitted';
    end if;
    if new.sub_org_id is null and new.vendor_name is null then raise exception 'Pick a sub or vendor' using errcode = '23514'; end if;
  else
    new.org_id := old.org_id; new.job_id := old.job_id; new.number := old.number; new.created_by := old.created_by; new.po_id := old.po_id;
    new.sub_org_id := old.sub_org_id; new.submitted_by_sub := old.submitted_by_sub; new.is_holdback_release := old.is_holdback_release;
    if not private.bill_internal(old.job_id, old.org_id, 'edit') then
      new.holdback_pct := old.holdback_pct; new.lien_waiver_required := old.lien_waiver_required; new.vendor_name := old.vendor_name;
    end if;
    if current_setting('app.bill_status', true) is distinct from 'on' then
      new.status := old.status; new.approved_at := old.approved_at; new.approved_by := old.approved_by; new.paid_at := old.paid_at;
      new.paid_amount := old.paid_amount; new.payment_method := old.payment_method; new.payment_ref := old.payment_ref;
      new.lien_waiver_received_at := old.lien_waiver_received_at; new.rejected_reason := old.rejected_reason;
    end if;
  end if;
  return new;
end $$;

alter policy bills_update on public.bills with check (
  private.bill_internal(job_id, org_id, 'edit')
  or (submitted_by_sub and private.is_my_linked_sub(org_id, sub_org_id)));

-- =====================================================================
-- 7. Comment audiences: fixed for portal authors; sub comments stay between the sub and the builder
-- =====================================================================
create or replace function private.before_comment_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select org_id into new.org_id from public.jobs where id = new.job_id;
  new.author_id := auth.uid();
  if private.is_job_internal(new.job_id) then
    new.author_type := 'internal';
  elsif private.is_job_sub(new.job_id) then
    new.author_type := 'sub';
    new.visible_to_subs := false;
    if new.visible_to_clients and not exists (
      select 1 from public.job_subs js join public.org_members m on m.org_id = js.sub_org_id
      where js.job_id = new.job_id and js.can_share_with_client and m.user_id = auth.uid() and m.status = 'active') then
      new.visible_to_clients := false;
    end if;
  elsif private.is_job_client(new.job_id) then
    new.author_type := 'client';
    new.visible_to_clients := true;
    new.visible_to_subs := false;
  else
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if new.parent_id is not null and not exists (
    select 1 from public.comments p where p.id = new.parent_id and p.record_type = new.record_type and p.record_id = new.record_id) then
    raise exception 'Reply must be on the same record' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function private.before_comment_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  new.org_id := old.org_id; new.job_id := old.job_id; new.record_type := old.record_type;
  new.record_id := old.record_id; new.parent_id := old.parent_id; new.author_id := old.author_id;
  new.author_type := old.author_type; new.created_at := old.created_at;
  if old.author_type <> 'internal' then
    new.visible_to_subs := old.visible_to_subs; new.visible_to_clients := old.visible_to_clients;
  end if;
  return new;
end $$;

-- A sub's own comments stay visible to its whole company on the job (not just the author)
create or replace function private.can_see_comment(p_job uuid, p_subs boolean, p_clients boolean, p_author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_author = auth.uid()
      or private.is_job_internal(p_job)
      or (p_subs and private.is_job_sub(p_job))
      or (p_clients and private.is_job_client(p_job))
      or (private.is_job_sub(p_job) and exists (
            select 1 from public.org_members a join public.org_members b on b.org_id = a.org_id and b.status = 'active'
            join public.organizations o on o.id = a.org_id and o.kind = 'sub'
            where a.user_id = p_author and b.user_id = auth.uid()));
$$;

-- =====================================================================
-- 8. Columns the wrong audience could read
-- =====================================================================
alter table public.jobs drop column if exists custom;
alter table public.daily_logs drop column if exists custom;
alter table public.builder_sub_links drop column if exists custom;
alter table public.cost_codes drop column if exists internal_notes;
alter table public.org_members drop column if exists labor_cost_rate;
alter table public.org_members drop column if exists billable_rate;

-- Notes for subs: readable by the builder team and subs on the job, not clients
create table public.job_sub_notes (
  job_id     uuid primary key references public.jobs (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  body       text not null default '' check (length(body) <= 4000),
  updated_at timestamptz not null default now()
);
alter table public.job_sub_notes enable row level security;
create trigger job_sub_notes_fill before insert or update on public.job_sub_notes
  for each row execute function private.fill_org_from_job();
create policy job_sub_notes_select on public.job_sub_notes for select to authenticated
  using (private.is_job_internal(job_id) or private.is_job_sub(job_id));
create policy job_sub_notes_insert on public.job_sub_notes for insert to authenticated
  with check (private.is_job_internal(job_id) and (private.can_module(job_id, 'jobs', 'edit') or private.has_perm(private.job_org(job_id), 'jobs', 'add')));
create policy job_sub_notes_update on public.job_sub_notes for update to authenticated
  using (private.can_module(job_id, 'jobs', 'edit')) with check (private.can_module(job_id, 'jobs', 'edit'));
grant select, insert, update on public.job_sub_notes to authenticated;
insert into public.job_sub_notes (job_id, org_id, body)
  select id, org_id, sub_notes from public.jobs where coalesce(sub_notes, '') <> '';
alter table public.jobs drop column sub_notes;

-- Selections: subs no longer read the table (allowance is builder/client only); they get a safe RPC
create or replace function private.selection_row_visible(p_job uuid, p_status public.selection_status, p_client boolean, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_module(p_job, 'selections', 'view')
      or (p_deleted is null and p_status <> 'draft' and p_client and private.is_job_client(p_job)
          and (p_status <> 'approved' or coalesce(private.client_setting(p_job, 'see_locked_selections'), 'true'::jsonb) <> 'false'::jsonb));
$$;
alter policy sel_select on public.selections using (private.selection_row_visible(job_id, status, share_client, deleted_at));

create or replace function public.sub_selections(p_jobs uuid[], p_id uuid default null)
returns table (id uuid, job_id uuid, title text, category text, location text, instructions text, deadline date,
               status public.selection_status, selected_choice_id uuid, share_subs boolean, share_client boolean, released_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.job_id, s.title, s.category, s.location, s.instructions, s.deadline, s.status, s.selected_choice_id,
         s.share_subs, s.share_client, s.released_at
  from public.selections s
  where s.job_id = any (p_jobs) and (p_id is null or s.id = p_id)
    and s.deleted_at is null and s.status <> 'draft' and s.share_subs and private.is_job_sub(s.job_id)
  order by s.deadline nulls last, s.title;
$$;
grant execute on function public.sub_selections(uuid[], uuid) to authenticated;

-- =====================================================================
-- 9. Prices need the price permission
-- =====================================================================
create or replace function private.co_visible(p_job uuid, p_status public.co_status, p_by_client boolean, p_created_by uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (private.can_module(p_job, 'change_orders', 'view') and private.has_perm(private.job_org(p_job), 'change_orders', 'price'))
      or (private.is_job_client(p_job) and (p_status <> 'draft' or (p_by_client and p_created_by = auth.uid())));
$$;

create or replace function public.co_price_lines(p_co uuid)
returns table (id uuid, title text, description text, quantity numeric, unit text, price numeric, taxable boolean, sort integer)
language sql stable security definer set search_path = '' as $$
  select i.id, i.title, i.description, i.quantity, i.unit, public.co_item_price(i), i.taxable, i.sort
  from public.change_order_items i join public.change_orders c on c.id = i.change_order_id
  where i.change_order_id = p_co and private.can_module(c.job_id, 'change_orders', 'view')
    and private.has_perm(c.org_id, 'change_orders', 'price')
  order by i.sort;
$$;

alter policy choices_select on public.selection_choices using (
  (private.can_module(private.selection_job(selection_id), 'selections', 'view')
     and private.has_perm(private.job_org(private.selection_job(selection_id)), 'selections', 'price'))
  or (private.is_job_client(private.selection_job(selection_id)) and public.can_see_selection(selection_id)));

-- =====================================================================
-- 10. Bill amounts only for people who can see the bill (or its builder's team)
-- =====================================================================
create or replace function public.bill_subtotal(p_bill uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(i.amount), 0) from public.bill_items i
  where i.bill_id = p_bill
    and exists (select 1 from public.bills b where b.id = p_bill and (private.is_member(b.org_id) or public.can_see_bill(b.id)));
$$;

create or replace function public.bill_holdback(p_bill uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select round(public.bill_subtotal(b.id) * b.holdback_pct / 100, 2) from public.bills b
  where b.id = p_bill and (private.is_member(b.org_id) or public.can_see_bill(b.id));
$$;

-- =====================================================================
-- 11. Parent pointers cannot be changed after insert
-- =====================================================================
create or replace function private.chat_message_freeze()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.conversation_id := old.conversation_id; new.author_id := old.author_id; new.created_at := old.created_at;
  return new;
end $$;
create trigger chat_messages_freeze before update on public.chat_messages
  for each row execute function private.chat_message_freeze();

create or replace function private.email_message_freeze()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.thread_id := old.thread_id; new.direction := old.direction; new.sent_by := old.sent_by;
    new.message_id := old.message_id; new.from_email := old.from_email; new.created_at := old.created_at;
    -- the sender may only record the outcome of its own queued send
    if not (old.status = 'queued' and new.status in ('queued', 'sent', 'failed')) then new.status := old.status; end if;
  end if;
  return new;
end $$;
create trigger email_messages_freeze before update on public.email_messages
  for each row execute function private.email_message_freeze();

create or replace function private.shift_job_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.job_id is distinct from old.job_id then
    if private.job_org(new.job_id) is distinct from old.org_id or not private.is_job_internal(new.job_id) then
      raise exception 'Pick one of your jobs' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger time_shifts_job_check before update on public.time_shifts
  for each row execute function private.shift_job_check();

-- =====================================================================
-- 12. Assignees must belong to the job / company
-- =====================================================================
create or replace function private.check_schedule_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_job uuid; v_org uuid;
begin
  select job_id, org_id into v_job, v_org from public.schedule_items where id = new.item_id;
  if new.sub_org_id is not null then
    if not exists (select 1 from public.job_subs where job_id = v_job and sub_org_id = new.sub_org_id) then
      raise exception 'That sub is not on this job' using errcode = '23514';
    end if;
  elsif new.user_id is not null and not exists (select 1 from public.org_members where org_id = v_org and user_id = new.user_id) then
    raise exception 'Assignee is not on your team' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger schedule_assignees_check before insert or update on public.schedule_assignees
  for each row execute function private.check_schedule_assignee();

create or replace function private.check_appt_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.warranty_claims;
begin
  c := private.claim_row(new.claim_id);
  if new.assignee_sub_org_id is not null and not exists (
       select 1 from public.builder_sub_links where builder_org_id = c.org_id and sub_org_id = new.assignee_sub_org_id and status = 'active') then
    raise exception 'That sub is not linked to your company' using errcode = '23514';
  end if;
  if new.assignee_user_id is not null and not exists (select 1 from public.org_members where org_id = c.org_id and user_id = new.assignee_user_id) then
    raise exception 'Assignee is not on your team' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger warranty_appts_check before insert or update on public.warranty_appointments
  for each row execute function private.check_appt_assignee();

create or replace function private.check_lead_salesperson()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.leads l join public.org_members m on m.org_id = l.org_id and m.user_id = new.user_id
                 where l.id = new.lead_id) then
    raise exception 'Salesperson is not on your team' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger lead_salespeople_check before insert or update on public.lead_salespeople
  for each row execute function private.check_lead_salesperson();

create or replace function private.check_submittal_reviewer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reviewer_user_id is not null and not exists (
       select 1 from public.org_members where org_id = new.org_id and user_id = new.reviewer_user_id) then
    raise exception 'Reviewer is not on your team' using errcode = '23514';
  end if;
  return new;
end $$;
-- runs after submittals_fill (alphabetical order) so org_id is set
create trigger submittals_reviewer_check before insert or update on public.submittals
  for each row execute function private.check_submittal_reviewer();

-- =====================================================================
-- 13. Missing permission checks
-- =====================================================================
create or replace function public.convert_lead_to_job(p_lead uuid, p_title text, p_contract public.contract_type default 'fixed_price', p_amount numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.leads; v_job uuid; v_sold uuid;
begin
  select * into l from public.leads where id = p_lead and deleted_at is null;
  if l.id is null or not private.can_see_lead(p_lead) then raise exception 'Lead not found' using errcode = 'P0002'; end if;
  -- leads.convert is the grant to create the job (sales roles have it without general jobs.add)
  if not private.has_action(l.org_id, 'leads.convert') then
    raise exception 'Not allowed to convert leads' using errcode = '42501';
  end if;
  if l.converted_job_id is not null then raise exception 'Already converted' using errcode = '23505'; end if;
  insert into public.jobs (org_id, title, status, contract_type, street, city, province, postal_code)
  values (l.org_id, coalesce(nullif(trim(p_title), ''), l.title), 'presale', p_contract, l.site_street, l.site_city, coalesce(l.site_province, 'AB'), l.site_postal)
  returning id into v_job;
  if p_amount is not null then update public.job_private set contract_price = p_amount where job_id = v_job; end if;
  if l.contact_first <> '' or l.contact_email is not null then
    insert into public.job_clients (job_id, first_name, last_name, email, phone, is_primary)
    values (v_job, l.contact_first, l.contact_last, l.contact_email, l.contact_phone, true);
  end if;
  select id into v_sold from public.lead_statuses where org_id = l.org_id and category = 'won' order by sort limit 1;
  update public.leads set status_id = v_sold, converted_job_id = v_job, sold_amount = coalesce(p_amount, sold_amount) where id = p_lead;
  return v_job;
end $$;

insert into public.app_actions (key, module, label)
  values ('proposals.approve_for_client', 'proposals', 'Approve proposals on behalf of a client')
  on conflict do nothing;
select set_config('app.seeding', 'on', true);
insert into public.role_actions (role_id, action)
  select role_id, 'proposals.approve_for_client' from public.role_actions where action = 'change_orders.approve_for_client'
  on conflict do nothing;
select set_config('app.seeding', 'off', true);

create or replace function public.decide_proposal(p_proposal uuid, p_decision text, p_signer_name text, p_signature text,
  p_comment text default null, p_ip text default null, p_ua text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.proposals; v_behalf boolean;
begin
  select * into p from public.proposals where id = p_proposal for update;
  if p.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if p.status <> 'released' then raise exception 'This proposal is not open for approval' using errcode = '22023'; end if;
  if p_decision not in ('approved', 'declined') then raise exception 'Bad decision' using errcode = '22023'; end if;
  if private.is_job_client(p.job_id) then v_behalf := false;
  elsif (private.can_module(p.job_id, 'proposals', 'edit') or private.can_module(p.job_id, 'estimates', 'edit'))
        and private.has_action(p.org_id, 'proposals.approve_for_client') then v_behalf := true;
  else raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.collect_signature and p_decision = 'approved' and coalesce(trim(p_signature), '') = '' then
    raise exception 'A signature is required' using errcode = '23514';
  end if;
  insert into public.proposal_signatures (proposal_id, decision, signer_name, signer_user_id, on_behalf, signature, comment, ip, user_agent)
  values (p_proposal, p_decision, trim(p_signer_name), auth.uid(), v_behalf, p_signature, p_comment, p_ip, p_ua);
  update public.proposals set status = p_decision::public.proposal_status, decided_at = now() where id = p_proposal;
  perform private.notify((select coalesce(array_agg(user_id), '{}') from public.job_managers where job_id = p.job_id) || array[p.created_by],
    p.org_id, p.job_id, 'proposal.decided', 'Proposal ' || p_decision || ': ' || p.title, p_comment, '/proposals/' || p.id);
end $$;

drop policy if exists claim_notes_all on public.warranty_claim_notes;
create policy claim_notes_select on public.warranty_claim_notes for select to authenticated
  using (private.can_module((private.claim_row(claim_id)).job_id, 'warranties', 'view'));
create policy claim_notes_insert on public.warranty_claim_notes for insert to authenticated
  with check (private.can_module((private.claim_row(claim_id)).job_id, 'warranties', 'edit'));
create policy claim_notes_update on public.warranty_claim_notes for update to authenticated
  using (private.can_module((private.claim_row(claim_id)).job_id, 'warranties', 'edit'))
  with check (private.can_module((private.claim_row(claim_id)).job_id, 'warranties', 'edit'));
create policy claim_notes_delete on public.warranty_claim_notes for delete to authenticated
  using (private.can_module((private.claim_row(claim_id)).job_id, 'warranties', 'edit'));

grant execute on all functions in schema private to authenticated;
