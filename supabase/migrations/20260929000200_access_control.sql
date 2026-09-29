-- =====================================================================
-- Access control: helper functions + row level security on every table.
-- =====================================================================

-- Nothing is readable anonymously.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Caller is an active member of the org (builder or sub)
create or replace function private.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

-- Caller is an admin of a sub org (can edit its company profile / users)
create or replace function private.is_sub_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    join public.organizations o on o.id = m.org_id and o.kind = 'sub'
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active' and m.is_admin
  );
$$;

-- Role permission check for an internal (builder) user.
-- p_verb: view | add | edit | delete | cost | price
create or replace function private.has_perm(p_org uuid, p_module text, p_verb text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_verb
             when 'view'   then rp.can_view
             when 'add'    then rp.can_add
             when 'edit'   then rp.can_edit
             when 'delete' then rp.can_delete
             when 'cost'   then rp.see_cost
             when 'price'  then rp.see_price
             else false
           end
    from public.org_members m
    join public.role_permissions rp on rp.role_id = m.role_id and rp.module = p_module
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  ), false);
$$;

-- Scope of a module permission for the caller: all | assigned | own (null = none)
create or replace function private.perm_scope(p_org uuid, p_module text)
returns public.perm_scope language sql stable security definer set search_path = '' as $$
  select rp.scope
  from public.org_members m
  join public.role_permissions rp on rp.role_id = m.role_id and rp.module = p_module
  where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active' and rp.can_view;
$$;

create or replace function private.has_action(p_org uuid, p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m
    join public.role_actions ra on ra.role_id = m.role_id and ra.action = p_action
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

-- Internal user who can open this job: active member of the builder, role allows
-- the job's status, jobs.view granted, and job access (all jobs, scope all,
-- assigned via job_members, or the creator). Row-based so it also works in
-- policies on freshly inserted rows (INSERT ... RETURNING).
create or replace function private.job_internal_ok(
  p_job uuid, p_org uuid, p_status public.job_status, p_created_by uuid, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and exists (
    select 1
    from public.org_members m
    join public.roles r on r.id = m.role_id
    join public.role_permissions rp on rp.role_id = r.id and rp.module = 'jobs' and rp.can_view
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
      and p_status = any (r.allowed_job_statuses)
      and (m.all_jobs or rp.scope = 'all' or p_created_by = auth.uid()
           or exists (select 1 from public.job_members jm where jm.job_id = p_job and jm.user_id = auth.uid()))
  );
$$;

create or replace function private.is_job_internal(p_job uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.job_internal_ok(j.id, j.org_id, j.status, j.created_by, j.deleted_at)
    from public.jobs j where j.id = p_job), false);
$$;

-- Member of a sub org that is on the job and still actively linked to the builder
create or replace function private.is_job_sub(p_job uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.jobs j
    join public.job_subs js on js.job_id = j.id
    join public.builder_sub_links l on l.builder_org_id = j.org_id and l.sub_org_id = js.sub_org_id and l.status = 'active'
    join public.org_members m on m.org_id = js.sub_org_id and m.user_id = auth.uid() and m.status = 'active'
    where j.id = p_job and j.deleted_at is null and j.status <> 'presale'
  );
$$;

create or replace function private.is_job_client(p_job uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.job_clients c
    join public.jobs j on j.id = c.job_id
    where c.job_id = p_job and c.user_id = auth.uid() and j.deleted_at is null
  );
$$;

create or replace function private.can_see_job(p_job uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_job_internal(p_job) or private.is_job_sub(p_job) or private.is_job_client(p_job);
$$;

-- Caller is an internal user of p_builder and p_sub is a sub linked to it
create or replace function private.is_linked_builder_of(p_sub uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.builder_sub_links l
    join public.org_members m on m.org_id = l.builder_org_id and m.user_id = auth.uid() and m.status = 'active'
    where l.sub_org_id = p_sub
  );
$$;

-- Caller is a member of a sub org actively linked to p_builder
create or replace function private.is_linked_sub_of(p_builder uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.builder_sub_links l
    join public.org_members m on m.org_id = l.sub_org_id and m.user_id = auth.uid() and m.status = 'active'
    where l.builder_org_id = p_builder and l.status = 'active'
  );
$$;

create or replace function private.is_client_of(p_builder uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.job_clients c
    join public.jobs j on j.id = c.job_id and j.deleted_at is null
    where j.org_id = p_builder and c.user_id = auth.uid()
  );
$$;

create or replace function private.can_see_org(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_member(p_org)
      or private.is_linked_sub_of(p_org)
      or private.is_linked_builder_of(p_org)
      or private.is_client_of(p_org);
$$;

-- Who can see whose profile (names, emails): people who work together
create or replace function private.can_see_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid()
      -- same org
      or exists (
        select 1 from public.org_members a
        join public.org_members b on b.org_id = a.org_id
        where a.user_id = auth.uid() and a.status = 'active' and b.user_id = p_user)
      -- builder <-> linked sub, either direction
      or exists (
        select 1 from public.builder_sub_links l
        join public.org_members a on a.user_id = auth.uid() and a.status = 'active'
                                 and a.org_id in (l.builder_org_id, l.sub_org_id)
        join public.org_members b on b.user_id = p_user
                                 and b.org_id in (l.builder_org_id, l.sub_org_id))
      -- clients on jobs the caller can see, and builder staff on the caller's client jobs
      or exists (
        select 1 from public.job_clients c
        where c.user_id = p_user and private.is_job_internal(c.job_id))
      or exists (
        select 1 from public.job_clients c
        join public.jobs j on j.id = c.job_id
        join public.org_members m on m.org_id = j.org_id and m.user_id = p_user
        where c.user_id = auth.uid());
$$;

-- Org id of a job (used by child-table policies)
create or replace function private.job_org(p_job uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select org_id from public.jobs where id = p_job;
$$;

grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------

-- A member's role must belong to the same org; builder members need a role.
create or replace function private.check_member_role()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind public.org_kind;
begin
  select kind into v_kind from public.organizations where id = new.org_id;
  if v_kind = 'builder' and new.role_id is null then
    raise exception 'Builder members need a role' using errcode = '23514';
  end if;
  if new.role_id is not null and not exists (
       select 1 from public.roles r where r.id = new.role_id and r.org_id = new.org_id) then
    raise exception 'Role does not belong to this organization' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger org_members_role_check before insert or update on public.org_members
  for each row execute function private.check_member_role();

-- job_subs requires an active link between the job's builder and the sub
create or replace function private.check_job_sub_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.builder_sub_links l
    join public.jobs j on j.org_id = l.builder_org_id
    where j.id = new.job_id and l.sub_org_id = new.sub_org_id) then
    raise exception 'Sub is not linked to this builder' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger job_subs_link_check before insert or update on public.job_subs
  for each row execute function private.check_job_sub_link();

-- builder_sub_links: builder must be a builder org, sub must be a sub org
create or replace function private.check_link_kinds()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select kind from public.organizations where id = new.builder_org_id) <> 'builder'
     or (select kind from public.organizations where id = new.sub_org_id) <> 'sub' then
    raise exception 'Links must join a builder org to a sub org' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger builder_sub_links_kind_check before insert or update on public.builder_sub_links
  for each row execute function private.check_link_kinds();

-- New jobs: creator gets access, private row exists
create or replace function private.after_job_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.job_private (job_id) values (new.id) on conflict do nothing;
  if new.created_by is not null then
    insert into public.job_members (job_id, user_id) values (new.id, new.created_by) on conflict do nothing;
  end if;
  return null;
end $$;
create trigger jobs_after_insert after insert on public.jobs
  for each row execute function private.after_job_insert();

-- Stamp creator
create or replace function private.stamp_created_by()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;
create trigger jobs_stamp before insert on public.jobs
  for each row execute function private.stamp_created_by();

-- Built-in and template roles are read-only (permissions included)
create or replace function private.lock_builtin_roles()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role uuid;
begin
  if tg_table_name = 'roles' then
    if (tg_op in ('UPDATE', 'DELETE')) and (old.is_builtin or old.is_template)
       and current_setting('app.seeding', true) is distinct from 'on' then
      raise exception 'Built-in roles cannot be changed. Copy it to a custom role instead.' using errcode = '42501';
    end if;
  else
    v_role := case when tg_op = 'DELETE' then old.role_id else new.role_id end;
    if exists (select 1 from public.roles r where r.id = v_role and (r.is_builtin or r.is_template))
       and current_setting('app.seeding', true) is distinct from 'on' then
      raise exception 'Built-in roles cannot be changed. Copy it to a custom role instead.' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger roles_lock before update or delete on public.roles
  for each row execute function private.lock_builtin_roles();
create trigger role_permissions_lock before insert or update or delete on public.role_permissions
  for each row execute function private.lock_builtin_roles();
create trigger role_actions_lock before insert or update or delete on public.role_actions
  for each row execute function private.lock_builtin_roles();

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.profiles                  enable row level security;
alter table public.organizations             enable row level security;
alter table public.app_modules               enable row level security;
alter table public.app_actions               enable row level security;
alter table public.roles                     enable row level security;
alter table public.role_permissions          enable row level security;
alter table public.role_actions              enable row level security;
alter table public.org_members               enable row level security;
alter table public.builder_sub_links         enable row level security;
alter table public.job_groups                enable row level security;
alter table public.jobs                      enable row level security;
alter table public.job_private               enable row level security;
alter table public.job_group_members         enable row level security;
alter table public.job_managers              enable row level security;
alter table public.job_members               enable row level security;
alter table public.job_subs                  enable row level security;
alter table public.job_clients               enable row level security;
alter table public.client_permission_defaults enable row level security;
alter table public.job_client_permissions    enable row level security;
alter table public.cost_categories           enable row level security;
alter table public.cost_codes                enable row level security;
alter table public.custom_field_defs         enable row level security;
alter table public.tags                      enable row level security;
alter table public.saved_views               enable row level security;
alter table public.user_state                enable row level security;
alter table public.user_job_selection        enable row level security;
alter table public.invites                   enable row level security;
alter table public.audit_log                 enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (private.can_see_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- organizations (created through RPCs only)
create policy organizations_select on public.organizations for select to authenticated
  using (private.can_see_org(id));
create policy organizations_update on public.organizations for update to authenticated
  using ((kind = 'builder' and private.has_action(id, 'settings.manage'))
      or (kind = 'sub' and private.is_sub_admin(id)))
  with check ((kind = 'builder' and private.has_action(id, 'settings.manage'))
      or (kind = 'sub' and private.is_sub_admin(id)));

-- reference data
create policy app_modules_select on public.app_modules for select to authenticated using (true);
create policy app_actions_select on public.app_actions for select to authenticated using (true);

-- roles
create policy roles_select on public.roles for select to authenticated
  using (is_template or private.is_member(org_id));
create policy roles_insert on public.roles for insert to authenticated
  with check (not is_template and not is_builtin and private.has_action(org_id, 'users.manage'));
create policy roles_update on public.roles for update to authenticated
  using (not is_builtin and private.has_action(org_id, 'users.manage'))
  with check (not is_builtin and not is_template and private.has_action(org_id, 'users.manage'));
create policy roles_delete on public.roles for delete to authenticated
  using (not is_builtin and private.has_action(org_id, 'users.manage'));

create policy role_permissions_select on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and (r.is_template or private.is_member(r.org_id))));
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and not r.is_builtin and private.has_action(r.org_id, 'users.manage')))
  with check (exists (select 1 from public.roles r where r.id = role_id and not r.is_builtin and private.has_action(r.org_id, 'users.manage')));

create policy role_actions_select on public.role_actions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and (r.is_template or private.is_member(r.org_id))));
create policy role_actions_write on public.role_actions for all to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and not r.is_builtin and private.has_action(r.org_id, 'users.manage')))
  with check (exists (select 1 from public.roles r where r.id = role_id and not r.is_builtin and private.has_action(r.org_id, 'users.manage')));

-- org_members
create policy org_members_select on public.org_members for select to authenticated
  using (private.is_member(org_id) or private.is_linked_builder_of(org_id) or user_id = (select auth.uid()));
create policy org_members_insert on public.org_members for insert to authenticated
  with check (private.has_action(org_id, 'users.manage') or private.is_sub_admin(org_id));
create policy org_members_update on public.org_members for update to authenticated
  using (private.has_action(org_id, 'users.manage') or private.is_sub_admin(org_id))
  with check (private.has_action(org_id, 'users.manage') or private.is_sub_admin(org_id));
create policy org_members_delete on public.org_members for delete to authenticated
  using (private.has_action(org_id, 'users.manage') or private.is_sub_admin(org_id));

-- builder_sub_links
create policy links_select on public.builder_sub_links for select to authenticated
  using ((private.is_member(builder_org_id) and private.has_perm(builder_org_id, 'subs_vendors', 'view'))
      or private.is_member(sub_org_id));
create policy links_insert on public.builder_sub_links for insert to authenticated
  with check (private.has_perm(builder_org_id, 'subs_vendors', 'add'));
create policy links_update on public.builder_sub_links for update to authenticated
  using (private.has_perm(builder_org_id, 'subs_vendors', 'edit'))
  with check (private.has_perm(builder_org_id, 'subs_vendors', 'edit'));
create policy links_delete on public.builder_sub_links for delete to authenticated
  using (private.has_perm(builder_org_id, 'subs_vendors', 'delete'));

-- job groups
create policy job_groups_select on public.job_groups for select to authenticated
  using (private.is_member(org_id));
create policy job_groups_write on public.job_groups for all to authenticated
  using (private.has_perm(org_id, 'jobs', 'edit')) with check (private.has_perm(org_id, 'jobs', 'edit'));

-- jobs
create policy jobs_select on public.jobs for select to authenticated
  using (private.job_internal_ok(id, org_id, status, created_by, deleted_at)
      or private.is_job_sub(id) or private.is_job_client(id));
create policy jobs_insert on public.jobs for insert to authenticated
  with check (private.has_perm(org_id, 'jobs', 'add'));
create policy jobs_update on public.jobs for update to authenticated
  using (private.job_internal_ok(id, org_id, status, created_by, deleted_at) and private.has_perm(org_id, 'jobs', 'edit'))
  with check (private.has_perm(org_id, 'jobs', 'edit'));
create policy jobs_delete on public.jobs for delete to authenticated
  using (private.is_job_internal(id) and private.has_perm(org_id, 'jobs', 'delete'));

-- job_private: internal users who can see prices
create policy job_private_select on public.job_private for select to authenticated
  using (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'price'));
create policy job_private_write on public.job_private for all to authenticated
  using (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'edit')
         and private.has_perm(private.job_org(job_id), 'jobs', 'price'))
  with check (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'edit')
         and private.has_perm(private.job_org(job_id), 'jobs', 'price'));

-- job child tables (internal manage)
create policy job_group_members_select on public.job_group_members for select to authenticated
  using (private.is_job_internal(job_id));
create policy job_group_members_write on public.job_group_members for all to authenticated
  using (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'edit'))
  with check (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'edit'));

create policy job_managers_select on public.job_managers for select to authenticated
  using (private.can_see_job(job_id));
create policy job_managers_write on public.job_managers for all to authenticated
  using (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'edit'))
  with check (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'edit'));

create policy job_members_select on public.job_members for select to authenticated
  using (private.is_job_internal(job_id) or user_id = (select auth.uid()));
create policy job_members_write on public.job_members for all to authenticated
  using (private.has_action(private.job_org(job_id), 'users.manage')
         or (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'edit')))
  with check (private.has_action(private.job_org(job_id), 'users.manage')
         or (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'edit')));

create policy job_subs_select on public.job_subs for select to authenticated
  using (private.is_job_internal(job_id) or private.is_member(sub_org_id));
create policy job_subs_write on public.job_subs for all to authenticated
  using (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'edit'))
  with check (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'edit'));

create policy job_clients_select on public.job_clients for select to authenticated
  using ((private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'clients', 'view'))
      or user_id = (select auth.uid())
      or (private.is_job_sub(job_id) and exists (
            select 1 from public.job_subs js join public.org_members m on m.org_id = js.sub_org_id
            where js.job_id = job_clients.job_id and js.can_view_owner_info
              and m.user_id = (select auth.uid()) and m.status = 'active')));
create policy job_clients_insert on public.job_clients for insert to authenticated
  with check (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'clients', 'add'));
create policy job_clients_update on public.job_clients for update to authenticated
  using (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'clients', 'edit'))
  with check (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'clients', 'edit'));
create policy job_clients_delete on public.job_clients for delete to authenticated
  using (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'clients', 'delete'));

create policy client_defaults_select on public.client_permission_defaults for select to authenticated
  using (private.is_member(org_id));
create policy client_defaults_write on public.client_permission_defaults for all to authenticated
  using (private.has_action(org_id, 'settings.manage')) with check (private.has_action(org_id, 'settings.manage'));

create policy job_client_perms_select on public.job_client_permissions for select to authenticated
  using (private.is_job_internal(job_id) or private.is_job_client(job_id));
create policy job_client_perms_write on public.job_client_permissions for all to authenticated
  using (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'edit'))
  with check (private.is_job_internal(job_id) and private.has_perm(private.job_org(job_id), 'jobs', 'edit'));

-- cost codes: builder staff + linked subs read; cost_codes perm writes
create policy cost_categories_select on public.cost_categories for select to authenticated
  using (private.is_member(org_id) or private.is_linked_sub_of(org_id));
create policy cost_categories_insert on public.cost_categories for insert to authenticated
  with check (private.has_perm(org_id, 'cost_codes', 'add'));
create policy cost_categories_update on public.cost_categories for update to authenticated
  using (private.has_perm(org_id, 'cost_codes', 'edit')) with check (private.has_perm(org_id, 'cost_codes', 'edit'));
create policy cost_categories_delete on public.cost_categories for delete to authenticated
  using (private.has_perm(org_id, 'cost_codes', 'delete'));

create policy cost_codes_select on public.cost_codes for select to authenticated
  using (private.is_member(org_id) or private.is_linked_sub_of(org_id));
create policy cost_codes_insert on public.cost_codes for insert to authenticated
  with check (private.has_perm(org_id, 'cost_codes', 'add'));
create policy cost_codes_update on public.cost_codes for update to authenticated
  using (private.has_perm(org_id, 'cost_codes', 'edit')) with check (private.has_perm(org_id, 'cost_codes', 'edit'));
create policy cost_codes_delete on public.cost_codes for delete to authenticated
  using (private.has_perm(org_id, 'cost_codes', 'delete'));

-- custom fields
create policy custom_fields_select on public.custom_field_defs for select to authenticated
  using (private.is_member(org_id)
      or (visible_to_subs and private.is_linked_sub_of(org_id))
      or (visible_to_clients and private.is_client_of(org_id)));
create policy custom_fields_write on public.custom_field_defs for all to authenticated
  using (private.has_action(org_id, 'settings.manage')) with check (private.has_action(org_id, 'settings.manage'));

-- tags
create policy tags_select on public.tags for select to authenticated
  using (private.is_member(org_id) or private.is_linked_sub_of(org_id));
create policy tags_write on public.tags for all to authenticated
  using (private.has_action(org_id, 'settings.manage') or private.has_perm(org_id, module, 'add'))
  with check (private.has_action(org_id, 'settings.manage') or private.has_perm(org_id, module, 'add'));

-- saved views
create policy saved_views_select on public.saved_views for select to authenticated
  using (user_id = (select auth.uid()) or (is_shared and private.is_member(org_id)));
create policy saved_views_insert on public.saved_views for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member(org_id));
create policy saved_views_update on public.saved_views for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saved_views_delete on public.saved_views for delete to authenticated
  using (user_id = (select auth.uid()));

-- per-user state
create policy user_state_all on public.user_state for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_job_selection_all on public.user_job_selection for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.can_see_org(org_id));

-- invites
create policy invites_select on public.invites for select to authenticated
  using ((kind = 'internal' and private.has_action(org_id, 'users.manage'))
      or (kind = 'sub' and private.has_perm(org_id, 'subs_vendors', 'add'))
      or (kind = 'client' and private.has_perm(org_id, 'clients', 'add')));
create policy invites_insert on public.invites for insert to authenticated
  with check (((kind = 'internal' and private.has_action(org_id, 'users.manage'))
      or (kind = 'sub' and private.has_perm(org_id, 'subs_vendors', 'add'))
      or (kind = 'client' and private.has_perm(org_id, 'clients', 'add')))
      and invited_by = (select auth.uid()));
create policy invites_delete on public.invites for delete to authenticated
  using ((kind = 'internal' and private.has_action(org_id, 'users.manage'))
      or (kind = 'sub' and private.has_perm(org_id, 'subs_vendors', 'add'))
      or (kind = 'client' and private.has_perm(org_id, 'clients', 'add')));

-- audit log: read-only, gated
create policy audit_select on public.audit_log for select to authenticated
  using (private.has_action(org_id, 'audit.view'));
