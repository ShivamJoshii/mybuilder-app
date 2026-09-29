-- =====================================================================
-- The 13 built-in role templates + onboarding / membership RPCs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Template helpers (used only while seeding)
-- ---------------------------------------------------------------------
create or replace function private.tpl(
  p_key text, p_name text, p_desc text, p_statuses public.job_status[], p_all_jobs boolean, p_sort int)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.roles (template_key, name, description, is_template, is_builtin, allowed_job_statuses, all_jobs_default, sort)
  values (p_key, p_name, p_desc, true, true, p_statuses, p_all_jobs, p_sort)
  returning id into v_id;
  return v_id;
end $$;

-- p_verbs: any of V A E D;  p_money: '' | 'c' | 'p' | 'cp'
create or replace function private.grant_tpl(
  p_role uuid, p_modules text[], p_verbs text, p_scope public.perm_scope, p_money text default '')
returns void language plpgsql set search_path = '' as $$
begin
  insert into public.role_permissions (role_id, module, can_view, can_add, can_edit, can_delete, scope, see_cost, see_price)
  select p_role, m, position('V' in p_verbs) > 0, position('A' in p_verbs) > 0,
         position('E' in p_verbs) > 0, position('D' in p_verbs) > 0, p_scope,
         position('c' in p_money) > 0, position('p' in p_money) > 0
  from unnest(p_modules) m
  on conflict (role_id, module) do update set
    can_view = excluded.can_view, can_add = excluded.can_add, can_edit = excluded.can_edit,
    can_delete = excluded.can_delete, scope = excluded.scope,
    see_cost = excluded.see_cost, see_price = excluded.see_price;
end $$;

create or replace function private.act_tpl(p_role uuid, p_actions text[])
returns void language sql set search_path = '' as $$
  insert into public.role_actions (role_id, action) select p_role, a from unnest(p_actions) a on conflict do nothing;
$$;

-- ---------------------------------------------------------------------
-- Seed templates
-- ---------------------------------------------------------------------
do $$
declare
  r uuid;
  all_mods   text[] := array(select key from public.app_modules order by sort);
  all_acts   text[] := array(select key from public.app_actions);
  all_st     public.job_status[] := '{presale,open,warranty,closed}';
begin
  perform set_config('app.seeding', 'on', true);

  -- Org Owner: everything
  r := private.tpl('org_owner', 'Org Owner', 'Full access to all features and settings, including subscription.', all_st, true, 1);
  perform private.grant_tpl(r, all_mods, 'VAED', 'all', 'cp');
  perform private.act_tpl(r, all_acts);

  -- Admin: everything except subscription
  r := private.tpl('admin', 'Admin', 'Full access except subscription management.', all_st, true, 2);
  perform private.grant_tpl(r, all_mods, 'VAED', 'all', 'cp');
  perform private.act_tpl(r, array(select key from public.app_actions where key <> 'subscription.manage'));

  -- Project Manager
  r := private.tpl('project_manager', 'Project Manager',
       'Runs assigned jobs end to end. No sales, internal users or client invoices.',
       '{open,warranty,closed}', false, 3);
  perform private.grant_tpl(r, '{schedule,daily_logs,todos,change_orders,selections,warranties,specs,submittals,files,messages,rfis,bids,purchase_orders,bills}', 'VAED', 'assigned', 'cp');
  perform private.grant_tpl(r, '{jobs,estimates,clients,subs_vendors,time_clock}', 'VAE', 'assigned', 'cp');
  perform private.grant_tpl(r, '{budget,reports,accounting}', 'V', 'assigned', 'cp');
  perform private.grant_tpl(r, '{cost_codes}', 'V', 'all');
  perform private.act_tpl(r, '{change_orders.approve_for_client,selections.approve_for_client,purchase_orders.approve_for_sub,time_clock.view_others,time_clock.approve,bills.approve}');

  -- Office Manager
  r := private.tpl('office_manager', 'Office Manager', 'Most of the office work. No estimates or warranty.', all_st, true, 4);
  perform private.grant_tpl(r, '{jobs,leads,proposals,schedule,daily_logs,todos,change_orders,selections,specs,submittals,files,messages,rfis,bids,purchase_orders,bills,invoices,clients,subs_vendors}', 'VAE', 'all', 'cp');
  perform private.grant_tpl(r, '{budget,reports,cost_codes,time_clock}', 'V', 'all', 'cp');
  perform private.act_tpl(r, '{time_clock.view_others,leads.convert}');

  -- Bookkeeper
  r := private.tpl('bookkeeper', 'Bookkeeper', 'Financials and job records. Limited schedule, to-dos, messages and bids.', all_st, true, 5);
  perform private.grant_tpl(r, '{purchase_orders,bills,budget,invoices,accounting,cost_codes}', 'VAED', 'all', 'cp');
  perform private.grant_tpl(r, '{estimates,change_orders,selections,reports,jobs,schedule,todos,bids,clients,subs_vendors,time_clock}', 'V', 'all', 'cp');
  perform private.grant_tpl(r, '{messages,files}', 'VA', 'all');
  perform private.act_tpl(r, '{bills.mark_paid,bills.approve,time_clock.view_others,time_clock.adjust_others}');

  -- Selections Coordinator
  r := private.tpl('selections_coordinator', 'Selections Coordinator', 'Selections, POs and change orders, with cost and price.', '{presale,open,closed}', false, 6);
  perform private.grant_tpl(r, '{selections}', 'VAED', 'assigned', 'cp');
  perform private.grant_tpl(r, '{change_orders,purchase_orders,todos}', 'VAE', 'assigned', 'cp');
  perform private.grant_tpl(r, '{files,messages}', 'VA', 'assigned');
  perform private.grant_tpl(r, '{jobs,specs,schedule,subs_vendors,cost_codes}', 'V', 'assigned');
  perform private.act_tpl(r, '{selections.approve_for_client}');

  -- Warranty Coordinator
  r := private.tpl('warranty_coordinator', 'Warranty Coordinator', 'Warranty claims, to-dos and communication.', '{open,warranty,closed}', false, 7);
  perform private.grant_tpl(r, '{warranties,todos}', 'VAED', 'assigned');
  perform private.grant_tpl(r, '{messages,rfis}', 'VAE', 'assigned');
  perform private.grant_tpl(r, '{files,daily_logs}', 'VA', 'assigned');
  perform private.grant_tpl(r, '{jobs,schedule,clients,subs_vendors}', 'V', 'assigned');

  -- Architect
  r := private.tpl('architect', 'Architect', 'View-only change orders and selections without pricing, plus plans, specs and RFIs.', '{presale,open,closed}', false, 8);
  perform private.grant_tpl(r, '{specs,rfis,submittals}', 'VAE', 'assigned');
  perform private.grant_tpl(r, '{files,messages}', 'VA', 'assigned');
  perform private.grant_tpl(r, '{jobs,schedule,change_orders,selections}', 'V', 'assigned');

  -- Project Estimator
  r := private.tpl('project_estimator', 'Project Estimator', 'Estimates, bids, selections and POs/bills, with cost and price.', all_st, true, 9);
  perform private.grant_tpl(r, '{estimates,bids}', 'VAED', 'all', 'cp');
  perform private.grant_tpl(r, '{proposals,selections,purchase_orders,bills,cost_codes,specs}', 'VAE', 'all', 'cp');
  perform private.grant_tpl(r, '{files,messages}', 'VA', 'all');
  perform private.grant_tpl(r, '{jobs,subs_vendors,budget,change_orders}', 'V', 'all', 'cp');

  -- Sales Rep
  r := private.tpl('sales_rep', 'Sales Rep', 'Manages their own leads and converts them to jobs. Sees pricing on proposals only.', all_st, false, 10);
  perform private.grant_tpl(r, '{leads,proposals}', 'VAE', 'own', 'p');
  perform private.grant_tpl(r, '{files,messages,clients}', 'VA', 'assigned');
  perform private.grant_tpl(r, '{jobs,estimates}', 'V', 'assigned', 'p');
  perform private.act_tpl(r, '{leads.convert}');

  -- Sales Manager
  r := private.tpl('sales_manager', 'Sales Manager', 'All leads, proposals and estimates.', all_st, true, 11);
  perform private.grant_tpl(r, '{leads,proposals,estimates}', 'VAED', 'all', 'cp');
  perform private.grant_tpl(r, '{clients}', 'VAE', 'all');
  perform private.grant_tpl(r, '{jobs,files,messages}', 'VA', 'all', 'cp');
  perform private.grant_tpl(r, '{reports,cost_codes}', 'V', 'all', 'cp');
  perform private.act_tpl(r, '{leads.convert}');

  -- Field Crew
  r := private.tpl('field_crew', 'Field Crew', 'To-dos, daily logs, time clock and schedule. No pricing.', '{open,warranty}', false, 12);
  perform private.grant_tpl(r, '{todos,daily_logs,time_clock}', 'VAE', 'assigned');
  perform private.grant_tpl(r, '{files,messages,rfis}', 'VA', 'assigned');
  perform private.grant_tpl(r, '{jobs,schedule,specs}', 'V', 'assigned');

  -- Purchasing Coordinator
  r := private.tpl('purchasing_coordinator', 'Purchasing Coordinator', 'Bids, POs and bills with cost and price. No client invoices or proposals.', all_st, true, 13);
  perform private.grant_tpl(r, '{bids,purchase_orders,bills}', 'VAED', 'all', 'cp');
  perform private.grant_tpl(r, '{subs_vendors}', 'VAE', 'all');
  perform private.grant_tpl(r, '{budget,estimates,cost_codes,selections,change_orders,jobs}', 'V', 'all', 'cp');
  perform private.grant_tpl(r, '{files,messages}', 'VA', 'all');
  perform private.act_tpl(r, '{bills.approve}');
end $$;

-- ---------------------------------------------------------------------
-- Copy templates into an org as locked built-in roles
-- ---------------------------------------------------------------------
create or replace function private.install_builtin_roles(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t record; v_new uuid;
begin
  perform set_config('app.seeding', 'on', true);
  for t in select * from public.roles where is_template order by sort loop
    insert into public.roles (org_id, template_key, name, description, is_template, is_builtin, allowed_job_statuses, all_jobs_default, sort)
    values (p_org, t.template_key, t.name, t.description, false, true, t.allowed_job_statuses, t.all_jobs_default, t.sort)
    returning id into v_new;
    insert into public.role_permissions (role_id, module, can_view, can_add, can_edit, can_delete, scope, see_cost, see_price)
      select v_new, module, can_view, can_add, can_edit, can_delete, scope, see_cost, see_price
      from public.role_permissions where role_id = t.id;
    insert into public.role_actions (role_id, action)
      select v_new, action from public.role_actions where role_id = t.id;
  end loop;
  perform set_config('app.seeding', 'off', true);
end $$;

-- Starter cost codes for Canadian home builders
create or replace function private.install_starter_cost_codes(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c uuid;
begin
  insert into public.cost_categories (org_id, name, sort) values (p_org, 'General conditions', 10) returning id into c;
  insert into public.cost_codes (org_id, category_id, code, title, sort, is_labor) values
    (p_org, c, '01-100', 'Permits and fees', 10, false),
    (p_org, c, '01-200', 'Supervision', 20, true),
    (p_org, c, '01-300', 'Temporary facilities', 30, false),
    (p_org, c, '01-400', 'Site cleanup and waste', 40, false);
  insert into public.cost_categories (org_id, name, sort) values (p_org, 'Site work and foundation', 20) returning id into c;
  insert into public.cost_codes (org_id, category_id, code, title, sort) values
    (p_org, c, '02-100', 'Excavation and backfill', 10),
    (p_org, c, '02-200', 'Footings and foundation walls', 20),
    (p_org, c, '02-300', 'Damp proofing and weeping tile', 30),
    (p_org, c, '02-400', 'Basement slab', 40);
  insert into public.cost_categories (org_id, name, sort) values (p_org, 'Structure and envelope', 30) returning id into c;
  insert into public.cost_codes (org_id, category_id, code, title, sort) values
    (p_org, c, '03-100', 'Framing labour', 10),
    (p_org, c, '03-200', 'Framing lumber and trusses', 20),
    (p_org, c, '03-300', 'Roofing', 30),
    (p_org, c, '03-400', 'Windows and exterior doors', 40),
    (p_org, c, '03-500', 'Siding, soffit and eavestrough', 50);
  insert into public.cost_categories (org_id, name, sort) values (p_org, 'Mechanical and electrical', 40) returning id into c;
  insert into public.cost_codes (org_id, category_id, code, title, sort) values
    (p_org, c, '04-100', 'Plumbing', 10),
    (p_org, c, '04-200', 'HVAC', 20),
    (p_org, c, '04-300', 'Electrical', 30),
    (p_org, c, '04-400', 'Insulation and vapour barrier', 40);
  insert into public.cost_categories (org_id, name, sort) values (p_org, 'Interior finishes', 50) returning id into c;
  insert into public.cost_codes (org_id, category_id, code, title, sort) values
    (p_org, c, '05-100', 'Drywall and taping', 10),
    (p_org, c, '05-200', 'Paint', 20),
    (p_org, c, '05-300', 'Flooring', 30),
    (p_org, c, '05-400', 'Tile', 40),
    (p_org, c, '05-500', 'Cabinets and countertops', 50),
    (p_org, c, '05-600', 'Interior trim and doors', 60),
    (p_org, c, '05-700', 'Appliances', 70);
  insert into public.cost_categories (org_id, name, sort) values (p_org, 'Exterior and landscaping', 60) returning id into c;
  insert into public.cost_codes (org_id, category_id, code, title, sort) values
    (p_org, c, '06-100', 'Concrete flatwork', 10),
    (p_org, c, '06-200', 'Decks and railings', 20),
    (p_org, c, '06-300', 'Landscaping', 30);
end $$;

-- ---------------------------------------------------------------------
-- RPCs (called from the app as the signed-in user)
-- ---------------------------------------------------------------------

-- Create a builder company; caller becomes Org Owner.
create or replace function public.create_builder_org(p_name text, p_province text default 'AB')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_owner uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  insert into public.organizations (kind, name, province, created_by)
  values ('builder', trim(p_name), p_province, auth.uid()) returning id into v_org;
  perform private.install_builtin_roles(v_org);
  select id into v_owner from public.roles where org_id = v_org and template_key = 'org_owner';
  insert into public.org_members (org_id, user_id, role_id, all_jobs) values (v_org, auth.uid(), v_owner, true);
  insert into public.client_permission_defaults (org_id) values (v_org);
  perform private.install_starter_cost_codes(v_org);
  insert into public.user_state (user_id, active_org_id) values (auth.uid(), v_org)
    on conflict (user_id) do update set active_org_id = excluded.active_org_id, updated_at = now();
  return v_org;
end $$;

-- Create a sub/vendor company; caller becomes its admin.
create or replace function public.create_sub_org(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  insert into public.organizations (kind, name, created_by) values ('sub', trim(p_name), auth.uid()) returning id into v_org;
  insert into public.org_members (org_id, user_id, is_admin) values (v_org, auth.uid(), true);
  insert into public.user_state (user_id, active_org_id) values (auth.uid(), v_org)
    on conflict (user_id) do update set active_org_id = excluded.active_org_id, updated_at = now();
  return v_org;
end $$;

-- Copy a role (built-in or custom) into a new editable custom role.
create or replace function public.clone_role(p_role uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_src public.roles; v_new uuid;
begin
  select * into v_src from public.roles where id = p_role;
  if v_src.id is null or v_src.org_id is null or not private.has_action(v_src.org_id, 'users.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.roles (org_id, name, description, allowed_job_statuses, all_jobs_default, sort)
  values (v_src.org_id, trim(p_name), v_src.description, v_src.allowed_job_statuses, v_src.all_jobs_default, 200)
  returning id into v_new;
  insert into public.role_permissions (role_id, module, can_view, can_add, can_edit, can_delete, scope, see_cost, see_price)
    select v_new, module, can_view, can_add, can_edit, can_delete, scope, see_cost, see_price
    from public.role_permissions where role_id = p_role;
  insert into public.role_actions (role_id, action) select v_new, action from public.role_actions where role_id = p_role;
  return v_new;
end $$;

-- Builder adds a sub/vendor. Reuses the sub's existing company when a sub
-- admin with that email already exists; otherwise creates a new sub org.
-- Returns the link id. An invite row is created for the sub's email.
create or replace function public.add_sub_vendor(
  p_builder uuid, p_company_name text, p_email text, p_trade text default null,
  p_contact_first text default null, p_contact_last text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_sub uuid; v_link uuid; v_email extensions.citext := lower(trim(p_email));
begin
  if not private.has_perm(p_builder, 'subs_vendors', 'add') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select m.org_id into v_sub
  from public.org_members m
  join public.organizations o on o.id = m.org_id and o.kind = 'sub'
  join public.profiles p on p.id = m.user_id
  where p.email = v_email and m.is_admin and m.status = 'active'
  order by m.joined_at limit 1;

  if v_sub is null then
    insert into public.organizations (kind, name, email, created_by)
    values ('sub', trim(p_company_name), v_email, auth.uid()) returning id into v_sub;
  end if;

  insert into public.builder_sub_links (builder_org_id, sub_org_id, trade, company_name, primary_contact_first,
                                        primary_contact_last, business_phone, primary_email)
  values (p_builder, v_sub, p_trade, trim(p_company_name), p_contact_first, p_contact_last, p_phone, v_email)
  on conflict (builder_org_id, sub_org_id) do update set status = 'active', updated_at = now()
  returning id into v_link;

  if not exists (select 1 from public.org_members m join public.profiles p on p.id = m.user_id
                 where m.org_id = v_sub and p.email = v_email) then
    insert into public.invites (org_id, kind, email, sub_org_id, invited_by)
    values (p_builder, 'sub', v_email, v_sub, auth.uid());
  end if;
  return v_link;
end $$;

-- Invite an internal user (creates the invite row; the app emails the link)
create or replace function public.invite_internal_user(p_org uuid, p_email text, p_role uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.has_action(p_org, 'users.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.roles where id = p_role and org_id = p_org) then
    raise exception 'Role does not belong to this organization' using errcode = '23514';
  end if;
  insert into public.invites (org_id, kind, email, role_id, invited_by)
  values (p_org, 'internal', lower(trim(p_email)), p_role, auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- Invite a client contact on a job
create or replace function public.invite_job_client(p_job_client uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_c public.job_clients; v_org uuid; v_id uuid;
begin
  select * into v_c from public.job_clients where id = p_job_client;
  v_org := private.job_org(v_c.job_id);
  if v_c.id is null or not private.is_job_internal(v_c.job_id) or not private.has_perm(v_org, 'clients', 'add') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_c.email is null then raise exception 'Client has no email' using errcode = '23514'; end if;
  insert into public.invites (org_id, kind, email, job_client_id, invited_by)
  values (v_org, 'client', v_c.email, v_c.id, auth.uid()) returning id into v_id;
  update public.job_clients set invited_at = now() where id = v_c.id;
  return v_id;
end $$;

-- Public-safe invite lookup for the accept page (no auth needed beyond token)
create or replace function public.invite_preview(p_token text)
returns table (kind public.invite_kind, email text, org_name text, expired boolean, accepted boolean)
language sql stable security definer set search_path = '' as $$
  select i.kind, i.email::text, o.name, i.expires_at < now(), i.accepted_at is not null
  from public.invites i join public.organizations o on o.id = i.org_id
  where i.token = p_token;
$$;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- Accept an invite as the signed-in user (email must match)
create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_i public.invites; v_email text; v_all boolean; v_has_admin boolean; v_active uuid;
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
    select all_jobs_default into v_all from public.roles where id = v_i.role_id;
    insert into public.org_members (org_id, user_id, role_id, all_jobs)
    values (v_i.org_id, auth.uid(), v_i.role_id, coalesce(v_all, false))
    on conflict (org_id, user_id) do update set role_id = excluded.role_id, status = 'active';
    v_active := v_i.org_id;
  elsif v_i.kind = 'sub' then
    select exists (select 1 from public.org_members where org_id = v_i.sub_org_id and is_admin) into v_has_admin;
    insert into public.org_members (org_id, user_id, is_admin)
    values (v_i.sub_org_id, auth.uid(), not v_has_admin)
    on conflict (org_id, user_id) do update set status = 'active';
    v_active := v_i.sub_org_id;
  else
    update public.job_clients set user_id = auth.uid() where id = v_i.job_client_id;
    v_active := v_i.org_id;
  end if;

  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = v_i.id;
  insert into public.user_state (user_id, active_org_id) values (auth.uid(), v_active)
    on conflict (user_id) do update set active_org_id = excluded.active_org_id, updated_at = now();
  return v_active;
end $$;

-- Sub edits its own per-builder company profile (cannot touch status/trade)
create or replace function public.update_my_sub_profile(p_link uuid, p_profile jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_link public.builder_sub_links;
begin
  select * into v_link from public.builder_sub_links where id = p_link;
  if v_link.id is null or not private.is_sub_admin(v_link.sub_org_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.builder_sub_links set
    company_name          = coalesce(nullif(trim(p_profile ->> 'company_name'), ''), company_name),
    primary_contact_first = coalesce(p_profile ->> 'primary_contact_first', primary_contact_first),
    primary_contact_last  = coalesce(p_profile ->> 'primary_contact_last', primary_contact_last),
    business_phone        = coalesce(p_profile ->> 'business_phone', business_phone),
    fax                   = coalesce(p_profile ->> 'fax', fax),
    cell_phone            = coalesce(p_profile ->> 'cell_phone', cell_phone),
    sms_opt_in            = coalesce((p_profile ->> 'sms_opt_in')::boolean, sms_opt_in),
    primary_email         = coalesce((p_profile ->> 'primary_email')::extensions.citext, primary_email),
    street                = coalesce(p_profile ->> 'street', street),
    city                  = coalesce(p_profile ->> 'city', city),
    province              = coalesce(p_profile ->> 'province', province),
    postal_code           = coalesce(p_profile ->> 'postal_code', postal_code)
  where id = p_link;
end $$;

-- Switch the active org (builder account switcher)
create or replace function public.set_active_org(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_see_org(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.user_state (user_id, active_org_id) values (auth.uid(), p_org)
    on conflict (user_id) do update set active_org_id = excluded.active_org_id, updated_at = now();
end $$;

-- Persist the job picker selection (only jobs the caller can see are kept)
create or replace function public.set_job_selection(p_org uuid, p_all boolean, p_job_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[];
begin
  if not private.can_see_org(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select coalesce(array_agg(j), '{}') into v_ids
  from unnest(coalesce(p_job_ids, '{}')) j where private.can_see_job(j);
  insert into public.user_job_selection (user_id, org_id, all_jobs, job_ids)
  values (auth.uid(), p_org, coalesce(p_all, false), v_ids)
  on conflict (user_id, org_id) do update
    set all_jobs = excluded.all_jobs, job_ids = excluded.job_ids, updated_at = now();
end $$;

-- Everything the app shell needs about the caller, in one call
create or replace function public.my_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'active_org_id', (select active_org_id from public.user_state where user_id = auth.uid()),
    'orgs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'org_id', o.id, 'kind', o.kind, 'name', o.name, 'logo_url', o.logo_url,
        'role_id', m.role_id, 'role_name', r.name, 'is_admin', m.is_admin, 'all_jobs', m.all_jobs,
        'allowed_job_statuses', r.allowed_job_statuses) order by o.name)
      from public.org_members m
      join public.organizations o on o.id = m.org_id
      left join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid() and m.status = 'active'), '[]'::jsonb),
    'builders_as_sub', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'builder_org_id', l.builder_org_id, 'builder_name', b.name, 'logo_url', b.logo_url,
        'sub_org_id', l.sub_org_id, 'link_id', l.id, 'company_name', l.company_name))
      from public.builder_sub_links l
      join public.organizations b on b.id = l.builder_org_id
      join public.org_members m on m.org_id = l.sub_org_id and m.user_id = auth.uid() and m.status = 'active'
      where l.status = 'active'), '[]'::jsonb),
    'client_orgs', coalesce((
      select jsonb_agg(distinct jsonb_build_object('org_id', o.id, 'name', o.name))
      from public.job_clients c join public.jobs j on j.id = c.job_id join public.organizations o on o.id = j.org_id
      where c.user_id = auth.uid() and j.deleted_at is null), '[]'::jsonb)
  );
$$;

-- Permissions of the caller in one org, for the UI to hide/show controls
create or replace function public.my_permissions(p_org uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'modules', coalesce((
      select jsonb_object_agg(rp.module, jsonb_build_object(
        'view', rp.can_view, 'add', rp.can_add, 'edit', rp.can_edit, 'delete', rp.can_delete,
        'scope', rp.scope, 'cost', rp.see_cost, 'price', rp.see_price))
      from public.org_members m join public.role_permissions rp on rp.role_id = m.role_id
      where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'), '{}'::jsonb),
    'actions', coalesce((
      select jsonb_agg(ra.action)
      from public.org_members m join public.role_actions ra on ra.role_id = m.role_id
      where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'), '[]'::jsonb)
  );
$$;

-- App RPCs: signed-in users only (PUBLIC execute is the Postgres default, remove it)
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;
grant execute on function public.invite_preview(text) to anon;

-- Seeding helpers are internal only
revoke execute on function private.tpl(text, text, text, public.job_status[], boolean, int) from authenticated;
revoke execute on function private.grant_tpl(uuid, text[], text, public.perm_scope, text) from authenticated;
revoke execute on function private.act_tpl(uuid, text[]) from authenticated;
revoke execute on function private.install_builtin_roles(uuid) from authenticated;
revoke execute on function private.install_starter_cost_codes(uuid) from authenticated;
