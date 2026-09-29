-- =====================================================================
-- Time clock: clock in/out by job and cost code (optional GPS), breaks,
-- submit → approve, labour cost at the person's rate flows into the job
-- budget as actual labour. Overtime is computed in the app (Alberta
-- rules by default: over 8 h/day or 44 h/week).
-- =====================================================================
create type public.shift_status as enum ('open', 'submitted', 'approved', 'rejected');

create table public.labor_rates (
  org_id       uuid not null references public.organizations (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  hourly_cost  numeric(10,2) not null check (hourly_cost >= 0),
  updated_at   timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table public.time_shifts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  job_id         uuid not null references public.jobs (id) on delete cascade,
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  cost_code_id   uuid references public.cost_codes (id) on delete set null,
  clock_in       timestamptz not null default now(),
  clock_out      timestamptz,
  break_minutes  int not null default 0 check (break_minutes between 0 and 720),
  notes          text check (length(notes) <= 2000),
  status         public.shift_status not null default 'open',
  in_lat numeric(9,6), in_lng numeric(9,6), out_lat numeric(9,6), out_lng numeric(9,6),
  hourly_cost    numeric(10,2),                   -- snapshot when approved
  approved_by    uuid references public.profiles (id) on delete set null,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  check (clock_out is null or clock_out > clock_in),
  check (clock_out is null or clock_out - clock_in <= interval '24 hours')
);
create index time_shifts_user on public.time_shifts (user_id, clock_in desc);
create index time_shifts_job on public.time_shifts (job_id);
create unique index time_shifts_one_open on public.time_shifts (user_id) where status = 'open';

create or replace function public.shift_hours(s public.time_shifts)
returns numeric language sql immutable set search_path = '' as $$
  select case when s.clock_out is null then null
         else round(greatest(extract(epoch from (s.clock_out - s.clock_in)) / 3600 - s.break_minutes / 60.0, 0)::numeric, 2) end
$$;

create or replace function private.shift_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select org_id into new.org_id from public.jobs where id = new.job_id;
  if tg_op = 'INSERT' then
    new.approved_by := null; new.approved_at := null; new.hourly_cost := null;
    if new.status not in ('open', 'submitted') then new.status := 'submitted'; end if;
    if new.status = 'open' then new.clock_out := null; end if;
  else
    if current_setting('app.shift_status', true) is distinct from 'on' then
      new.approved_by := old.approved_by; new.approved_at := old.approved_at; new.hourly_cost := old.hourly_cost;
      if old.status = 'approved' then raise exception 'Approved shifts are locked' using errcode = '55000'; end if;
      if new.status = 'approved' then new.status := old.status; end if;
    end if;
    new.user_id := old.user_id;
  end if;
  if new.status in ('submitted', 'approved') and new.clock_out is null then raise exception 'Clock out first' using errcode = '23514'; end if;
  return new;
end $$;
create trigger time_shifts_fill before insert or update on public.time_shifts for each row execute function private.shift_fill();

create or replace function private.shift_manage(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_perm(p_org, 'time_clock', 'view') and private.has_action(p_org, 'time_clock.adjust_others');
$$;
create or replace function private.shift_view_others(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_perm(p_org, 'time_clock', 'view') and private.has_action(p_org, 'time_clock.view_others');
$$;
grant execute on function private.shift_manage(uuid), private.shift_view_others(uuid) to authenticated;

create or replace function public.clock_in(p_job uuid, p_cost_code uuid default null, p_lat numeric default null, p_lng numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  select org_id into v_org from public.jobs where id = p_job;
  if v_org is null or not private.is_job_internal(p_job) or not private.has_perm(v_org, 'time_clock', 'add') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.time_shifts where user_id = auth.uid() and status = 'open') then raise exception 'You are already clocked in' using errcode = '23505'; end if;
  insert into public.time_shifts (org_id, job_id, user_id, cost_code_id, in_lat, in_lng, status) values (v_org, p_job, auth.uid(), p_cost_code, p_lat, p_lng, 'open') returning id into v_id;
  return v_id;
end $$;

create or replace function public.clock_out(p_break int default 0, p_notes text default null, p_lat numeric default null, p_lng numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.time_shifts set clock_out = greatest(now(), clock_in + interval '1 minute'), break_minutes = coalesce(p_break, 0), notes = p_notes, out_lat = p_lat, out_lng = p_lng, status = 'submitted'
  where user_id = auth.uid() and status = 'open' returning id into v_id;
  if v_id is null then raise exception 'You are not clocked in' using errcode = '22023'; end if;
  return v_id;
end $$;

create or replace function public.review_shifts(p_ids uuid[], p_approve boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform set_config('app.shift_status', 'on', true);
  update public.time_shifts s set status = case when p_approve then 'approved'::public.shift_status else 'rejected'::public.shift_status end,
    approved_by = case when p_approve then auth.uid() end, approved_at = case when p_approve then now() end,
    hourly_cost = case when p_approve then coalesce((select hourly_cost from public.labor_rates r where r.org_id = s.org_id and r.user_id = s.user_id), 0) end
  where s.id = any(p_ids) and s.status = 'submitted' and private.has_action(s.org_id, 'time_clock.approve') and s.user_id <> auth.uid();
  get diagnostics n = row_count;
  perform set_config('app.shift_status', 'off', true);
  return n;
end $$;

do $$ declare f text; begin
  foreach f in array array['clock_in(uuid, uuid, numeric, numeric)', 'clock_out(int, text, numeric, numeric)', 'review_shifts(uuid[], boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

alter table public.labor_rates enable row level security;
alter table public.time_shifts enable row level security;
create policy rates_select on public.labor_rates for select to authenticated
  using (user_id = (select auth.uid()) or private.has_action(org_id, 'settings.manage') or (private.has_perm(org_id, 'time_clock', 'cost') and private.shift_view_others(org_id)));
create policy rates_write on public.labor_rates for all to authenticated using (private.has_action(org_id, 'settings.manage')) with check (private.has_action(org_id, 'settings.manage'));

create policy shifts_select on public.time_shifts for select to authenticated
  using (user_id = (select auth.uid()) or (private.shift_view_others(org_id) and private.is_job_internal(job_id)));
create policy shifts_insert on public.time_shifts for insert to authenticated
  with check (private.is_job_internal(job_id) and private.has_perm(org_id, 'time_clock', 'add')
              and (user_id = (select auth.uid()) or private.shift_manage(org_id)));
create policy shifts_update on public.time_shifts for update to authenticated
  using ((user_id = (select auth.uid()) and status <> 'approved') or private.shift_manage(org_id))
  with check ((user_id = (select auth.uid())) or private.shift_manage(org_id));
create policy shifts_delete on public.time_shifts for delete to authenticated
  using ((user_id = (select auth.uid()) and status in ('open', 'submitted', 'rejected')) or private.shift_manage(org_id));
revoke all on public.labor_rates, public.time_shifts from anon;

-- Budget actuals now include approved labour
create or replace function public.job_budget(p_job uuid)
returns table (cost_code_id uuid, cost_type public.cost_type, original_cost numeric, original_price numeric, co_cost numeric, co_price numeric,
               committed numeric, actual numeric, paid numeric)
language sql stable security definer set search_path = '' as $$
  with auth_ok as (select private.can_module(p_job, 'budget', 'view') and private.has_perm(private.job_org(p_job), 'budget', 'cost') ok),
  b as (
    select cost_code_id, cost_type,
      sum(original_cost) filter (where source = 'estimate') oc, sum(original_price) filter (where source = 'estimate') op,
      sum(original_cost) filter (where source <> 'estimate') cc, sum(original_price) filter (where source <> 'estimate') cp
    from public.budget_lines where job_id = p_job group by 1, 2),
  c as (
    select i.cost_code_id, i.cost_type, sum(round(i.quantity * i.unit_cost, 2)) amt
    from public.po_items i join public.purchase_orders p on p.id = i.po_id
    where p.job_id = p_job and p.status in ('released', 'accepted') and p.deleted_at is null group by 1, 2),
  a0 as (
    select i.cost_code_id, i.cost_type, i.amount amt, case when x.status = 'paid' then i.amount else 0 end pd
    from public.bill_items i join public.bills x on x.id = i.bill_id
    where x.job_id = p_job and x.status in ('approved', 'paid') and x.deleted_at is null
    union all
    select s.cost_code_id, 'labor'::public.cost_type, round(public.shift_hours(s) * coalesce(s.hourly_cost, 0), 2), round(public.shift_hours(s) * coalesce(s.hourly_cost, 0), 2)
    from public.time_shifts s where s.job_id = p_job and s.status = 'approved'),
  a as (select cost_code_id, cost_type, sum(amt) amt, sum(pd) pd from a0 group by 1, 2),
  k as (select cost_code_id, cost_type from b union select cost_code_id, cost_type from c union select cost_code_id, cost_type from a)
  select k.cost_code_id, k.cost_type, coalesce(b.oc, 0), coalesce(b.op, 0), coalesce(b.cc, 0), coalesce(b.cp, 0),
         coalesce(c.amt, 0), coalesce(a.amt, 0), coalesce(a.pd, 0)
  from k left join b on b.cost_code_id is not distinct from k.cost_code_id and b.cost_type = k.cost_type
         left join c on c.cost_code_id is not distinct from k.cost_code_id and c.cost_type = k.cost_type
         left join a on a.cost_code_id is not distinct from k.cost_code_id and a.cost_type = k.cost_type
  where (select ok from auth_ok);
$$;

-- WIP cost to date includes approved labour
create or replace function public.report_wip(p_org uuid)
returns table (job_id uuid, job_title text, status public.job_status, contract numeric, revised_cost numeric, committed numeric,
               cost_to_date numeric, billed numeric, received numeric)
language sql stable security definer set search_path = '' as $$
  select j.id, j.title, j.status,
    coalesce((select sum(original_price) from public.budget_lines where job_id = j.id), 0),
    coalesce((select sum(original_cost) from public.budget_lines where job_id = j.id), 0),
    coalesce((select sum(round(i.quantity * i.unit_cost, 2)) from public.po_items i join public.purchase_orders p on p.id = i.po_id
              where p.job_id = j.id and p.status in ('released', 'accepted') and p.deleted_at is null), 0),
    coalesce((select sum(bi.amount) from public.bill_items bi join public.bills b on b.id = bi.bill_id
              where b.job_id = j.id and b.status in ('approved', 'paid') and b.deleted_at is null), 0)
      + coalesce((select sum(round(public.shift_hours(s) * coalesce(s.hourly_cost, 0), 2)) from public.time_shifts s where s.job_id = j.id and s.status = 'approved'), 0),
    coalesce((select sum(l.amount) from public.client_invoice_lines l join public.client_invoices ci on ci.id = l.invoice_id
              where ci.job_id = j.id and ci.status in ('released', 'paid') and ci.deleted_at is null), 0),
    coalesce((select sum(p.amount) from public.client_payments p join public.client_invoices ci on ci.id = p.invoice_id
              where ci.job_id = j.id and ci.deleted_at is null), 0)
  from public.jobs j
  where j.org_id = p_org and j.deleted_at is null and j.status in ('open', 'warranty', 'presale')
    and private.reports_ok(p_org) and private.is_job_internal(j.id)
  order by j.title;
$$;

