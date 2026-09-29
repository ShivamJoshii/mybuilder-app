-- Job templates: a template is a job flagged is_template. Its schedule, to-dos, selections, specs,
-- estimate and folder structure are copied into new jobs, with dates shifted to the new start date.

alter table public.jobs add column is_template boolean not null default false;
create index jobs_templates_idx on public.jobs (org_id) where is_template;

-- Templates never have subs or clients, and never become templates/jobs by editing
create or replace function private.template_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.jobs where id = new.job_id and is_template) then
    raise exception 'Templates can''t have subs or clients' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger job_subs_template_guard before insert on public.job_subs for each row execute function private.template_guard();
create trigger job_clients_template_guard before insert on public.job_clients for each row execute function private.template_guard();

create or replace function private.job_template_freeze()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.is_template := old.is_template; end if;
  return new;
end $$;
create trigger jobs_template_freeze before update on public.jobs for each row execute function private.job_template_freeze();

-- Bulk copies don't notify anyone
create or replace function private.notify(p_users uuid[], p_org uuid, p_job uuid, p_type text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid; v_id uuid; t public.app_notification_types; p public.notification_prefs;
begin
  if current_setting('app.quiet', true) = 'on' then return; end if;
  select * into t from public.app_notification_types where key = p_type;
  if t.key is null then return; end if;
  for u in select distinct x from unnest(p_users) x where x is not null and x is distinct from auth.uid() loop
    insert into public.notifications (user_id, org_id, job_id, type, title, body, link, actor_id)
    values (u, p_org, p_job, p_type, left(p_title, 200), left(p_body, 500), p_link, auth.uid())
    returning id into v_id;
    select * into p from public.notification_prefs where user_id = u and type = p_type;
    if coalesce(p.email, t.default_email) then insert into public.notification_deliveries (notification_id, channel) values (v_id, 'email'); end if;
    if coalesce(p.text, t.default_text) then insert into public.notification_deliveries (notification_id, channel) values (v_id, 'text'); end if;
    if coalesce(p.push, t.default_push) then insert into public.notification_deliveries (notification_id, channel) values (v_id, 'push'); end if;
  end loop;
end $$;

-- Date anchor of a job: first schedule item, else projected start, else today
create or replace function private.job_anchor(p_job uuid)
returns date language sql stable security definer set search_path = '' as $$
  select coalesce((select min(start_date) from public.schedule_items where job_id = p_job and deleted_at is null),
                  (select projected_start from public.jobs where id = p_job), current_date);
$$;

/**
 * Copy a job's content into another job of the same company.
 * p_parts: any of schedule, todos, selections, specs, estimate, folders. Dates move by (p_start - anchor of the source).
 */
create or replace function public.copy_job_content(p_from uuid, p_to uuid, p_start date, p_parts text[])
returns void language plpgsql security definer set search_path = '' as $$
declare f public.jobs; t public.jobs; d int; v_est_from uuid; v_est_to uuid;
begin
  select * into f from public.jobs where id = p_from and deleted_at is null;
  select * into t from public.jobs where id = p_to and deleted_at is null;
  if f.id is null or t.id is null or f.org_id <> t.org_id
     or not private.can_module(p_from, 'jobs', 'view') or not private.can_module(p_to, 'jobs', 'edit') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- only the parts the caller may read on the source and create on the target
  p_parts := array(select x from unnest(p_parts) x where case x
    when 'schedule'   then private.can_module(p_from, 'schedule', 'view') and private.can_module(p_to, 'schedule', 'add')
    when 'todos'      then private.can_module(p_from, 'todos', 'view') and private.can_module(p_to, 'todos', 'add')
    when 'selections' then private.can_module(p_from, 'selections', 'view') and private.can_module(p_to, 'selections', 'add')
    when 'specs'      then private.can_module(p_from, 'specs', 'view') and private.can_module(p_to, 'specs', 'add')
    when 'estimate'   then private.can_module(p_from, 'estimates', 'view') and private.can_module(p_to, 'estimates', 'edit')
    when 'folders'    then private.can_module(p_from, 'files', 'view') and private.can_module(p_to, 'files', 'add')
    else false end);
  d := coalesce(p_start, private.job_anchor(p_from)) - private.job_anchor(p_from);
  perform set_config('app.quiet', 'on', true);
  create temp table if not exists _copy_map (old uuid primary key, new uuid not null) on commit drop;
  truncate _copy_map;

  if 'schedule' = any (p_parts) then
    insert into _copy_map select id, gen_random_uuid() from public.schedule_phases where job_id = p_from;
    insert into public.schedule_phases (id, org_id, job_id, name, color, sort)
      select m.new, t.org_id, p_to, p.name, p.color, p.sort from public.schedule_phases p join _copy_map m on m.old = p.id;
    insert into _copy_map select id, gen_random_uuid() from public.schedule_items where job_id = p_from and deleted_at is null;
    insert into public.schedule_items (id, org_id, job_id, phase_id, title, color, start_date, duration, end_date, is_hourly, start_time, end_time,
                                       progress, show_on_gantt, show_subs, show_client, notes_all, reminder_days, created_by)
      select m.new, t.org_id, p_to, pm.new, i.title, i.color, i.start_date + d, i.duration, i.end_date + d, i.is_hourly, i.start_time, i.end_time,
             0, i.show_on_gantt, i.show_subs, i.show_client, i.notes_all, i.reminder_days, auth.uid()
      from public.schedule_items i join _copy_map m on m.old = i.id left join _copy_map pm on pm.old = i.phase_id
      where i.job_id = p_from and i.deleted_at is null;
    insert into public.schedule_links (predecessor_id, successor_id, type, lag_days)
      select a.new, b.new, l.type, l.lag_days from public.schedule_links l join _copy_map a on a.old = l.predecessor_id join _copy_map b on b.old = l.successor_id;
    insert into public.schedule_item_notes (item_id, audience, body)
      select m.new, n.audience, n.body from public.schedule_item_notes n join _copy_map m on m.old = n.item_id;
    insert into public.schedule_assignees (item_id, user_id)
      select m.new, a.user_id from public.schedule_assignees a join _copy_map m on m.old = a.item_id
      where a.user_id is not null and exists (select 1 from public.org_members om where om.org_id = t.org_id and om.user_id = a.user_id and om.status = 'active');
  end if;

  if 'todos' = any (p_parts) then
    insert into _copy_map select id, gen_random_uuid() from public.todos where job_id = p_from and deleted_at is null on conflict do nothing;
    insert into public.todos (id, org_id, job_id, title, notes, priority, due_at, has_due_time, reminder_minutes, tag_ids, created_by)
      select m.new, t.org_id, p_to, x.title, x.notes, x.priority, x.due_at + make_interval(days => d), x.has_due_time, x.reminder_minutes, x.tag_ids, auth.uid()
      from public.todos x join _copy_map m on m.old = x.id where x.job_id = p_from and x.deleted_at is null;
    insert into public.todo_checklist (todo_id, body, sort)
      select m.new, c.body, c.sort from public.todo_checklist c join _copy_map m on m.old = c.todo_id;
    insert into public.todo_assignees (todo_id, user_id)
      select m.new, a.user_id from public.todo_assignees a join _copy_map m on m.old = a.todo_id
      where a.user_id is not null and exists (select 1 from public.org_members om where om.org_id = t.org_id and om.user_id = a.user_id and om.status = 'active');
  end if;

  if 'selections' = any (p_parts) then
    insert into _copy_map select id, gen_random_uuid() from public.selections where job_id = p_from and deleted_at is null on conflict do nothing;
    insert into public.selections (id, org_id, job_id, title, category, location, instructions, allowance, deadline, schedule_item_id, days_before, share_client, share_subs)
      select m.new, t.org_id, p_to, s.title, s.category, s.location, s.instructions, s.allowance, s.deadline + d,
             case when 'schedule' = any (p_parts) then si.new end, s.days_before, s.share_client, s.share_subs
      from public.selections s join _copy_map m on m.old = s.id left join _copy_map si on si.old = s.schedule_item_id
      where s.job_id = p_from and s.deleted_at is null;
    insert into _copy_map select c.id, gen_random_uuid() from public.selection_choices c join public.selections s on s.id = c.selection_id
      where s.job_id = p_from and s.deleted_at is null on conflict do nothing;
    insert into public.selection_choices (id, selection_id, title, description, vendor, product_code, client_price, is_available, sort)
      select cm.new, sm.new, c.title, c.description, c.vendor, c.product_code, c.client_price, c.is_available, c.sort
      from public.selection_choices c join _copy_map cm on cm.old = c.id join _copy_map sm on sm.old = c.selection_id;
    insert into public.selection_choice_costs (choice_id, builder_cost)
      select cm.new, k.builder_cost from public.selection_choice_costs k join _copy_map cm on cm.old = k.choice_id;
  end if;

  if 'specs' = any (p_parts) then
    insert into public.spec_documents (org_id, job_id, division, title, body, share_subs, share_clients, created_by)
      select t.org_id, p_to, s.division, s.title, s.body, s.share_subs, s.share_clients, auth.uid()
      from public.spec_documents s where s.job_id = p_from and s.deleted_at is null;
  end if;

  if 'estimate' = any (p_parts) then
    select id into v_est_from from public.estimates where job_id = p_from;
    if v_est_from is not null then
      select id into v_est_to from public.estimates where job_id = p_to;
      if v_est_to is null then
        insert into public.estimates (org_id, job_id, default_markup_pct, tax_rate, tax_label)
          select t.org_id, p_to, e.default_markup_pct, e.tax_rate, e.tax_label from public.estimates e where e.id = v_est_from returning id into v_est_to;
      elsif exists (select 1 from public.estimate_items where estimate_id = v_est_to) or (select locked_at from public.estimates where id = v_est_to) is not null then
        raise exception 'The new job already has an estimate' using errcode = '23505';
      end if;
      insert into _copy_map select id, gen_random_uuid() from public.estimate_groups where estimate_id = v_est_from on conflict do nothing;
      insert into public.estimate_groups (id, estimate_id, name, sort, is_optional)
        select m.new, v_est_to, g.name, g.sort, g.is_optional from public.estimate_groups g join _copy_map m on m.old = g.id;
      insert into public.estimate_items (estimate_id, group_id, cost_code_id, cost_type, title, description, internal_notes, quantity, unit, unit_cost,
                                         markup_type, markup_value, taxable, marked_as, sort)
        select v_est_to, gm.new, i.cost_code_id, i.cost_type, i.title, i.description, i.internal_notes, i.quantity, i.unit, i.unit_cost,
               i.markup_type, i.markup_value, i.taxable, i.marked_as, i.sort
        from public.estimate_items i left join _copy_map gm on gm.old = i.group_id where i.estimate_id = v_est_from;
    end if;
  end if;

  if 'folders' = any (p_parts) then
    insert into public.file_folders (org_id, job_id, kind, name, share_subs, share_clients)
      select t.org_id, p_to, x.kind, x.name, x.share_subs, x.share_clients from public.file_folders x
      where x.job_id = p_from and x.system_key is null and x.deleted_at is null
        and not exists (select 1 from public.file_folders y where y.job_id = p_to and y.kind = x.kind and y.name = x.name and y.deleted_at is null);
  end if;
  perform set_config('app.quiet', 'off', true);
end $$;
grant execute on function public.copy_job_content(uuid, uuid, date, text[]) to authenticated;

-- Save an existing job (or template) as a new template
create or replace function public.save_as_template(p_job uuid, p_title text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare j public.jobs; v uuid;
begin
  select * into j from public.jobs where id = p_job and deleted_at is null;
  if j.id is null or not private.can_module(p_job, 'jobs', 'view') or not private.has_perm(j.org_id, 'jobs', 'add') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.jobs (org_id, title, status, color, job_type, contract_type, work_days, province, is_template, projected_start)
  values (j.org_id, coalesce(nullif(trim(p_title), ''), j.title || ' (template)'), 'open', j.color, j.job_type, j.contract_type, j.work_days, j.province, true,
          private.job_anchor(p_job))
  returning id into v;
  perform public.copy_job_content(p_job, v, private.job_anchor(p_job), array['schedule', 'todos', 'selections', 'specs', 'estimate', 'folders']);
  return v;
end $$;
grant execute on function public.save_as_template(uuid, text) to authenticated;

grant execute on all functions in schema private to authenticated;
