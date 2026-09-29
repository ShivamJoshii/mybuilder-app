-- RLS performance. Row policies called SECURITY DEFINER helpers per row (never inlined), so a builder with
-- 40,000 to-dos waited ~30 s for a list. Each hot policy now gets a fast first branch built from arrays that
-- Postgres computes once per statement (the `(select …)` init-plan pattern); the original rule stays as the
-- fallback, so nothing that was visible disappears and nothing new becomes visible (every fast branch is a
-- strict subset of the original rule).

-- Jobs where the caller is internal staff with <module, verb> (same rule as can_module)
create or replace function private.jobs_internal(p_module text, p_verb text default 'view')
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct j.id), '{}')
  from public.jobs j
  join public.org_members m on m.org_id = j.org_id and m.user_id = auth.uid() and m.status = 'active'
  join public.roles r on r.id = m.role_id
  join public.role_permissions rj on rj.role_id = r.id and rj.module = 'jobs' and rj.can_view
  join public.role_permissions rm on rm.role_id = r.id and rm.module = p_module
  where j.deleted_at is null and j.status = any (r.allowed_job_statuses)
    and case p_verb when 'view' then rm.can_view when 'add' then rm.can_add when 'edit' then rm.can_edit
                    when 'delete' then rm.can_delete when 'cost' then rm.see_cost when 'price' then rm.see_price else false end
    and (m.all_jobs or rj.scope = 'all' or j.created_by = auth.uid()
         or exists (select 1 from public.job_members jm where jm.job_id = j.id and jm.user_id = auth.uid()));
$$;

-- Companies where the caller has <module, verb> (same rule as has_perm)
create or replace function private.orgs_perm(p_module text, p_verb text)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.org_id), '{}')
  from public.org_members m join public.role_permissions rp on rp.role_id = m.role_id and rp.module = p_module
  where m.user_id = auth.uid() and m.status = 'active'
    and case p_verb when 'view' then rp.can_view when 'add' then rp.can_add when 'edit' then rp.can_edit
                    when 'delete' then rp.can_delete when 'cost' then rp.see_cost when 'price' then rp.see_price else false end;
$$;

-- Companies where the caller only sees their own records in a module
create or replace function private.orgs_scope_own(p_module text)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.org_id), '{}')
  from public.org_members m join public.role_permissions rp on rp.role_id = m.role_id and rp.module = p_module
  where m.user_id = auth.uid() and m.status = 'active' and rp.can_view and rp.scope = 'own';
$$;

create or replace function private.orgs_action(p_action text)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.org_id), '{}')
  from public.org_members m join public.role_actions ra on ra.role_id = m.role_id and ra.action = p_action
  where m.user_id = auth.uid() and m.status = 'active';
$$;

create or replace function private.my_conversations()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(conversation_id), '{}') from public.chat_members where user_id = auth.uid();
$$;

grant execute on function private.jobs_internal(text, text), private.orgs_perm(text, text), private.orgs_scope_own(text),
  private.orgs_action(text), private.my_conversations() to authenticated;

-- Prepend a fast branch to a policy's USING expression
create or replace function pg_temp.fast(p_table text, p_policy text, p_fast text)
returns void language plpgsql as $$
declare q text;
begin
  select qual into q from pg_policies where schemaname = 'public' and tablename = p_table and policyname = p_policy;
  if q is null then raise exception 'policy %.% not found', p_table, p_policy; end if;
  execute format('alter policy %I on public.%I using ((%s) or (%s))', p_policy, p_table, p_fast, q);
end $$;

select pg_temp.fast('jobs', 'jobs_select', $f$id = any ((select private.jobs_internal('jobs', 'view'))::uuid[])$f$);

select pg_temp.fast('todos', 'todos_select', $f$deleted_at is null and job_id = any ((select private.jobs_internal('todos', 'view'))::uuid[])
  and not (org_id = any ((select private.orgs_scope_own('todos'))::uuid[]))$f$);
select pg_temp.fast('todo_assignees', 'todo_assignees_select', $f$exists (select 1 from public.todos t where t.id = todo_assignees.todo_id)$f$);
select pg_temp.fast('todo_checklist', 'todo_checklist_select', $f$exists (select 1 from public.todos t where t.id = todo_checklist.todo_id)$f$);
select pg_temp.fast('todo_watchers', 'todo_watchers_select', $f$exists (select 1 from public.todos t where t.id = todo_watchers.todo_id)$f$);

select pg_temp.fast('daily_logs', 'daily_logs_select', $f$deleted_at is null and status = 'published' and (share_internal or author_type = 'sub')
  and job_id = any ((select private.jobs_internal('daily_logs', 'view'))::uuid[])$f$);

select pg_temp.fast('schedule_items', 'items_select', $f$deleted_at is null and job_id = any ((select private.jobs_internal('schedule', 'view'))::uuid[])$f$);
select pg_temp.fast('schedule_assignees', 'assignees_select', $f$exists (select 1 from public.schedule_items i where i.id = schedule_assignees.item_id)$f$);
select pg_temp.fast('schedule_links', 'links_select', $f$exists (select 1 from public.schedule_items i where i.id = schedule_links.predecessor_id)
  and exists (select 1 from public.schedule_items i where i.id = schedule_links.successor_id)$f$);

select pg_temp.fast('files', 'files_select', $f$deleted_at is null and job_id = any ((select private.jobs_internal('files', 'view'))::uuid[])$f$);
select pg_temp.fast('file_folders', 'folders_select', $f$deleted_at is null and job_id = any ((select private.jobs_internal('files', 'view'))::uuid[])$f$);
select pg_temp.fast('comments', 'comments_select', $f$deleted_at is null and job_id = any ((select private.jobs_internal('jobs', 'view'))::uuid[])$f$);
select pg_temp.fast('rfis', 'rfis_select', $f$deleted_at is null and status <> 'not_sent' and job_id = any ((select private.jobs_internal('rfis', 'view'))::uuid[])$f$);
select pg_temp.fast('time_shifts', 'shifts_select', $f$job_id = any ((select private.jobs_internal('time_clock', 'view'))::uuid[])
  and org_id = any ((select private.orgs_action('time_clock.view_others'))::uuid[])$f$);

select pg_temp.fast('bills', 'bills_select', $f$job_id = any ((select private.jobs_internal('bills', 'view'))::uuid[]) and org_id = any ((select private.orgs_perm('bills', 'cost'))::uuid[])$f$);
select pg_temp.fast('purchase_orders', 'po_select', $f$job_id = any ((select private.jobs_internal('purchase_orders', 'view'))::uuid[])
  and org_id = any ((select private.orgs_perm('purchase_orders', 'cost'))::uuid[])$f$);
select pg_temp.fast('selections', 'sel_select', $f$job_id = any ((select private.jobs_internal('selections', 'view'))::uuid[])$f$);
select pg_temp.fast('change_orders', 'co_select', $f$job_id = any ((select private.jobs_internal('change_orders', 'view'))::uuid[])
  and org_id = any ((select private.orgs_perm('change_orders', 'price'))::uuid[])$f$);
select pg_temp.fast('client_invoices', 'inv_select', $f$job_id = any ((select private.jobs_internal('invoices', 'view'))::uuid[])$f$);
select pg_temp.fast('warranty_claims', 'claims_select', $f$job_id = any ((select private.jobs_internal('warranties', 'view'))::uuid[])$f$);
select pg_temp.fast('spec_documents', 'specs_select', $f$job_id = any ((select private.jobs_internal('specs', 'view'))::uuid[])$f$);
select pg_temp.fast('plan_sheets', 'sheets_select', $f$job_id = any ((select private.jobs_internal('specs', 'view'))::uuid[])$f$);
select pg_temp.fast('submittals', 'submittals_select', $f$job_id = any ((select private.jobs_internal('submittals', 'view'))::uuid[])$f$);
select pg_temp.fast('estimates', 'estimates_select', $f$job_id = any ((select private.jobs_internal('estimates', 'view'))::uuid[])$f$);
select pg_temp.fast('email_threads', 'threads_select', $f$job_id = any ((select private.jobs_internal('messages', 'view'))::uuid[])$f$);
select pg_temp.fast('leads', 'leads_select', $f$deleted_at is null and org_id = any ((select private.orgs_perm('leads', 'view'))::uuid[])
  and not (org_id = any ((select private.orgs_scope_own('leads'))::uuid[]))$f$);

-- Exact rewrites (same rule, evaluated once per statement)
alter policy chat_messages_select on public.chat_messages using (conversation_id = any ((select private.my_conversations())::uuid[]));
alter policy chat_members_select on public.chat_members using (conversation_id = any ((select private.my_conversations())::uuid[]));
alter policy chat_conv_select on public.chat_conversations using (id = any ((select private.my_conversations())::uuid[]));
alter policy audit_select on public.audit_log using (org_id = any ((select private.orgs_action('audit.view'))::uuid[]));

-- Indexes the fast paths lean on
create index if not exists daily_logs_job_idx on public.daily_logs (job_id, log_date desc) where deleted_at is null;
create index if not exists files_job_idx on public.files (job_id) where deleted_at is null;
create index if not exists comments_record_idx on public.comments (record_type, record_id) where deleted_at is null;
create index if not exists comments_job_idx on public.comments (job_id) where deleted_at is null;
create index if not exists schedule_items_job_idx on public.schedule_items (job_id, start_date) where deleted_at is null;
create index if not exists time_shifts_org_idx on public.time_shifts (org_id, clock_in);
create index if not exists chat_messages_conv_idx on public.chat_messages (conversation_id, created_at);
create index if not exists chat_members_user_idx on public.chat_members (user_id);
create index if not exists role_actions_action_idx on public.role_actions (action);
