-- Custom field values. Each value is visible only to people who can see both the field's audience
-- (team / subs / clients) and the record itself (checked through the record table's own RLS).

create table public.custom_field_values (
  def_id     uuid not null references public.custom_field_defs (id) on delete cascade,
  record_id  uuid not null,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  job_id     uuid references public.jobs (id) on delete cascade,
  value      jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (def_id, record_id)
);
create index custom_field_values_record_idx on public.custom_field_values (record_id);
alter table public.custom_field_values enable row level security;

-- Modules that carry custom fields, and where their records live
create or replace function private.cf_record(p_module text, p_record uuid, out org_id uuid, out job_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  case p_module
    when 'jobs'       then select j.org_id, j.id into org_id, job_id from public.jobs j where j.id = p_record;
    when 'leads'      then select l.org_id, null::uuid into org_id, job_id from public.leads l where l.id = p_record;
    when 'daily_logs' then select d.org_id, d.job_id into org_id, job_id from public.daily_logs d where d.id = p_record;
    when 'todos'      then select t.org_id, t.job_id into org_id, job_id from public.todos t where t.id = p_record;
    when 'rfis'       then select r.org_id, r.job_id into org_id, job_id from public.rfis r where r.id = p_record;
    when 'warranties' then select w.org_id, w.job_id into org_id, job_id from public.warranty_claims w where w.id = p_record;
    else org_id := null; job_id := null;
  end case;
end $$;

-- Invoker: the caller's own RLS on the record table decides
create or replace function private.cf_record_visible(p_module text, p_record uuid)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
begin
  return case p_module
    when 'jobs'       then exists (select 1 from public.jobs where id = p_record)
    when 'leads'      then exists (select 1 from public.leads where id = p_record)
    when 'daily_logs' then exists (select 1 from public.daily_logs where id = p_record)
    when 'todos'      then exists (select 1 from public.todos where id = p_record)
    when 'rfis'       then exists (select 1 from public.rfis where id = p_record)
    when 'warranties' then exists (select 1 from public.warranty_claims where id = p_record)
    else false end;
end $$;

create or replace function private.cf_can_edit(p_module text, p_org uuid, p_job uuid, p_record uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_member(p_org) and case
    when p_module = 'leads' then private.has_perm(p_org, 'leads', 'edit') and private.can_see_lead(p_record)
    when p_job is not null then private.can_module(p_job, p_module, 'edit')
    else false end;
$$;

create or replace function private.cf_audience_ok(p_def uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.custom_field_defs d where d.id = p_def and (
    private.is_member(d.org_id)
    or (d.visible_to_subs and private.is_linked_sub_of(d.org_id))
    or (d.visible_to_clients and private.is_client_of(d.org_id))));
$$;

create or replace function private.cf_module(p_def uuid)
returns text language sql stable security definer set search_path = '' as $$
  select module from public.custom_field_defs where id = p_def;
$$;

create or replace function private.cf_value_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d public.custom_field_defs; r record; v jsonb := new.value; t text; ok boolean;
begin
  select * into d from public.custom_field_defs where id = new.def_id;
  if tg_op = 'UPDATE' then new.def_id := old.def_id; new.record_id := old.record_id; end if;
  select * into r from private.cf_record(d.module, new.record_id);
  if r.org_id is null or r.org_id <> d.org_id then raise exception 'That record is not in this company' using errcode = '23514'; end if;
  new.org_id := r.org_id; new.job_id := r.job_id; new.updated_by := auth.uid(); new.updated_at := now();
  t := jsonb_typeof(v);
  ok := case d.data_type
      when 'text' then t = 'string' and length(v #>> '{}') <= 500
      when 'long_text' then t = 'string' and length(v #>> '{}') <= 8000
      when 'number' then t = 'number'
      when 'currency' then t = 'number'
      when 'date' then t = 'string' and (v #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
      when 'boolean' then t = 'boolean'
      when 'single_select' then t = 'string' and d.options ? (v #>> '{}')
      when 'multi_select' then t = 'array' and not exists (select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string' or not d.options ? (e #>> '{}'))
      when 'hyperlink' then t = 'string' and (v #>> '{}') ~* '^https?://' and length(v #>> '{}') <= 2000
      else false end;
  if not coalesce(ok, false) then
    raise exception 'Invalid value for %', d.label using errcode = '22023';
  end if;
  return new;
end $$;
create trigger custom_field_values_fill before insert or update on public.custom_field_values
  for each row execute function private.cf_value_fill();

create policy cf_values_select on public.custom_field_values for select to authenticated
  using (private.cf_audience_ok(def_id) and private.cf_record_visible(private.cf_module(def_id), record_id));
create policy cf_values_insert on public.custom_field_values for insert to authenticated
  with check (private.cf_can_edit(private.cf_module(def_id), org_id, job_id, record_id));
create policy cf_values_update on public.custom_field_values for update to authenticated
  using (private.cf_can_edit(private.cf_module(def_id), org_id, job_id, record_id))
  with check (private.cf_can_edit(private.cf_module(def_id), org_id, job_id, record_id));
create policy cf_values_delete on public.custom_field_values for delete to authenticated
  using (private.cf_can_edit(private.cf_module(def_id), org_id, job_id, record_id));
grant select, insert, update, delete on public.custom_field_values to authenticated;

grant execute on all functions in schema private to authenticated;
