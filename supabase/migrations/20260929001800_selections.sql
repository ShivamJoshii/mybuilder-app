-- =====================================================================
-- Selections and allowances. The builder lists choices for a finish; the
-- client picks one before the deadline; the builder approves (locks) it.
-- If the pick is over/under the allowance, approval can raise a draft
-- change order for the difference.
-- Prices: client_price lives on the choice (clients see it), builder
-- cost lives in selection_choice_costs (cost permission only). Subs see
-- shared selections and choices without any prices.
-- =====================================================================

create type public.selection_status as enum ('draft', 'pending', 'selected', 'approved');

create table public.selections (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id) on delete cascade,
  job_id                uuid not null references public.jobs (id) on delete cascade,
  title                 text not null check (length(trim(title)) between 1 and 200),
  category              text check (length(category) <= 80),
  location              text check (length(location) <= 80),
  instructions          text check (length(instructions) <= 8000),
  allowance             numeric(14,2) check (allowance is null or allowance >= 0),
  deadline              date,
  schedule_item_id      uuid references public.schedule_items (id) on delete set null,
  days_before           int check (days_before is null or days_before between 0 and 365),
  share_client          boolean not null default true,
  share_subs            boolean not null default false,
  status                public.selection_status not null default 'draft',
  selected_choice_id    uuid,
  selected_by           uuid references public.profiles (id) on delete set null,
  selected_at           timestamptz,
  approved_by           uuid references public.profiles (id) on delete set null,
  approved_at           timestamptz,
  change_order_id       uuid references public.change_orders (id) on delete set null,
  created_by            uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at            timestamptz not null default now(),
  released_at           timestamptz,
  deleted_at            timestamptz
);
create index selections_job on public.selections (job_id) where deleted_at is null;

create table public.selection_choices (
  id             uuid primary key default gen_random_uuid(),
  selection_id   uuid not null references public.selections (id) on delete cascade,
  title          text not null check (length(trim(title)) between 1 and 200),
  description    text check (length(description) <= 4000),
  vendor         text check (length(vendor) <= 120),
  product_code   text check (length(product_code) <= 80),
  client_price   numeric(14,2) not null default 0,
  is_available   boolean not null default true,
  sort           int not null default 0,
  created_at     timestamptz not null default now()
);
create index selection_choices_sel on public.selection_choices (selection_id, sort);
alter table public.selections add constraint selections_choice_fk foreign key (selected_choice_id) references public.selection_choices (id) on delete set null;

create table public.selection_choice_costs (
  choice_id     uuid primary key references public.selection_choices (id) on delete cascade,
  builder_cost  numeric(14,2) not null default 0
);

-- Deadline follows a linked schedule item
create or replace function private.selection_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_start date;
begin
  if tg_op = 'INSERT' then
    select org_id into new.org_id from public.jobs where id = new.job_id;
    new.created_by := auth.uid(); new.status := 'draft';
    new.selected_choice_id := null; new.selected_by := null; new.selected_at := null;
    new.approved_by := null; new.approved_at := null; new.released_at := null; new.change_order_id := null;
  else
    new.org_id := old.org_id; new.job_id := old.job_id; new.created_by := old.created_by; new.created_at := old.created_at;
    if current_setting('app.selection_status', true) is distinct from 'on' then
      new.status := old.status; new.selected_choice_id := old.selected_choice_id; new.selected_by := old.selected_by; new.selected_at := old.selected_at;
      new.approved_by := old.approved_by; new.approved_at := old.approved_at; new.released_at := old.released_at; new.change_order_id := old.change_order_id;
    end if;
  end if;
  if new.schedule_item_id is not null then
    select start_date into v_start from public.schedule_items where id = new.schedule_item_id and job_id = new.job_id;
    if v_start is null then raise exception 'Schedule item is not on this job' using errcode = '23514'; end if;
    new.deadline := v_start - coalesce(new.days_before, 0);
  end if;
  return new;
end $$;
create trigger selections_fill before insert or update on public.selections for each row execute function private.selection_fill();

create or replace function private.selection_follow_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.start_date is distinct from old.start_date then
    update public.selections set deadline = new.start_date - coalesce(days_before, 0) where schedule_item_id = new.id and status <> 'approved';
  end if;
  return null;
end $$;
create trigger schedule_items_selection_deadline after update of start_date on public.schedule_items for each row execute function private.selection_follow_schedule();

create or replace function private.selection_visible(p_job uuid, p_status public.selection_status, p_client boolean, p_subs boolean, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_module(p_job, 'selections', 'view')
      or (p_deleted is null and p_status <> 'draft' and (
            (p_client and private.is_job_client(p_job)
               and (p_status <> 'approved' or coalesce(private.client_setting(p_job, 'see_locked_selections'), 'true'::jsonb) <> 'false'::jsonb))
         or (p_subs and private.is_job_sub(p_job))));
$$;
create or replace function public.can_see_selection(p_sel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.selections s where s.id = p_sel and private.selection_visible(s.job_id, s.status, s.share_client, s.share_subs, s.deleted_at));
$$;
create or replace function private.selection_job(p_sel uuid)
returns uuid language sql stable security definer set search_path = '' as $$ select job_id from public.selections where id = p_sel $$;
create or replace function private.selection_open(p_sel uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select status <> 'approved' from public.selections where id = p_sel $$;
create or replace function private.choice_selection(p_choice uuid)
returns uuid language sql stable security definer set search_path = '' as $$ select selection_id from public.selection_choices where id = p_choice $$;
grant execute on function private.selection_visible(uuid, public.selection_status, boolean, boolean, timestamptz), private.selection_job(uuid),
  private.selection_open(uuid), private.choice_selection(uuid) to authenticated;

-- Choice lists for subs: no prices
create or replace function public.selection_choices_public(p_sel uuid)
returns table (id uuid, title text, description text, vendor text, product_code text, is_available boolean, sort int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.title, c.description, c.vendor, c.product_code, c.is_available, c.sort
  from public.selection_choices c where c.selection_id = p_sel and public.can_see_selection(p_sel) order by c.sort;
$$;

-- Release to the client
create or replace function public.release_selection(p_sel uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.selections;
begin
  select * into s from public.selections where id = p_sel for update;
  if s.id is null or not private.can_module(s.job_id, 'selections', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if s.status <> 'draft' then raise exception 'Already released' using errcode = '22023'; end if;
  if not exists (select 1 from public.selection_choices where selection_id = p_sel and is_available) then
    raise exception 'Add at least one available choice first' using errcode = '22023';
  end if;
  perform set_config('app.selection_status', 'on', true);
  update public.selections set status = 'pending', released_at = now() where id = p_sel;
  perform set_config('app.selection_status', 'off', true);
  if s.share_client then
    perform private.notify((select coalesce(array_agg(user_id), '{}') from public.job_clients where job_id = s.job_id and user_id is not null),
      s.org_id, s.job_id, 'selection.released', 'Make a selection: ' || s.title,
      case when s.deadline is not null then 'Please choose by ' || to_char(s.deadline, 'Mon DD, YYYY') end, '/selections/' || s.id);
  end if;
end $$;

-- Client (or builder) picks a choice
create or replace function public.choose_selection(p_sel uuid, p_choice uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.selections; v_client boolean;
begin
  select * into s from public.selections where id = p_sel for update;
  if s.id is null or s.deleted_at is not null then raise exception 'Not found' using errcode = 'P0002'; end if;
  v_client := s.share_client and private.is_job_client(s.job_id);
  if not (v_client or private.can_module(s.job_id, 'selections', 'edit')) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if s.status not in ('pending', 'selected') then raise exception 'This selection is not open' using errcode = '22023'; end if;
  if not exists (select 1 from public.selection_choices where id = p_choice and selection_id = p_sel and is_available) then
    raise exception 'Pick an available choice' using errcode = '22023';
  end if;
  perform set_config('app.selection_status', 'on', true);
  update public.selections set status = 'selected', selected_choice_id = p_choice, selected_by = auth.uid(), selected_at = now() where id = p_sel;
  perform set_config('app.selection_status', 'off', true);
  if v_client then
    perform private.notify(coalesce((select array_agg(user_id) from public.job_managers where job_id = s.job_id), '{}') || array[s.created_by],
      s.org_id, s.job_id, 'selection.selected', 'Selection made: ' || s.title,
      (select title from public.selection_choices where id = p_choice), '/selections/' || s.id);
  end if;
end $$;

-- Builder approves (locks) the pick; optionally raises a change order for the allowance difference
create or replace function public.approve_selection(p_sel uuid, p_create_co boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.selections; c public.selection_choices; v_cost numeric; v_diff numeric; v_co uuid;
begin
  select * into s from public.selections where id = p_sel for update;
  if s.id is null or not private.can_module(s.job_id, 'selections', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if s.status <> 'selected' then raise exception 'Nothing selected yet' using errcode = '22023'; end if;
  select * into c from public.selection_choices where id = s.selected_choice_id;
  v_diff := c.client_price - coalesce(s.allowance, c.client_price);
  if p_create_co and v_diff <> 0 then
    select builder_cost into v_cost from public.selection_choice_costs where choice_id = c.id;
    insert into public.change_orders (org_id, job_id, number, title, description)
    values (s.org_id, s.job_id, 0, 'Selection: ' || s.title,
            c.title || ' is ' || case when v_diff > 0 then 'over' else 'under' end || ' the ' || to_char(s.allowance, 'FM$999,999,990.00') || ' allowance.')
    returning id into v_co;
    insert into public.change_order_items (change_order_id, cost_type, title, quantity, unit, unit_cost, markup_type, markup_value, taxable, sort)
    values (v_co, 'material', case when v_diff > 0 then 'Allowance overage: ' else 'Allowance credit: ' end || c.title, 1, 'ea', v_diff, 'amount', 0, true, 1);
  end if;
  perform set_config('app.selection_status', 'on', true);
  update public.selections set status = 'approved', approved_by = auth.uid(), approved_at = now(), change_order_id = coalesce(v_co, change_order_id) where id = p_sel;
  perform set_config('app.selection_status', 'off', true);
  if s.share_client then
    perform private.notify((select coalesce(array_agg(user_id), '{}') from public.job_clients where job_id = s.job_id and user_id is not null),
      s.org_id, s.job_id, 'selection.approved', 'Selection approved: ' || s.title, c.title, '/selections/' || s.id);
  end if;
  return v_co;
end $$;

create or replace function public.unlock_selection(p_sel uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.selections;
begin
  select * into s from public.selections where id = p_sel for update;
  if s.id is null or not private.can_module(s.job_id, 'selections', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if s.status <> 'approved' then raise exception 'Not approved' using errcode = '22023'; end if;
  perform set_config('app.selection_status', 'on', true);
  update public.selections set status = 'selected', approved_by = null, approved_at = null where id = p_sel;
  perform set_config('app.selection_status', 'off', true);
end $$;

do $$ declare f text; begin
  foreach f in array array['can_see_selection(uuid)', 'selection_choices_public(uuid)', 'release_selection(uuid)', 'choose_selection(uuid, uuid)',
    'approve_selection(uuid, boolean)', 'unlock_selection(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

insert into public.app_notification_types (key, grp, module, label, sort) values
  ('selection.released', 'Project Management', 'Selections', 'Selection ready to choose', 30),
  ('selection.selected', 'Project Management', 'Selections', 'Client made a selection', 31),
  ('selection.approved', 'Project Management', 'Selections', 'Selection approved', 32);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.selections enable row level security;
alter table public.selection_choices enable row level security;
alter table public.selection_choice_costs enable row level security;

create policy sel_select on public.selections for select to authenticated
  using (private.selection_visible(job_id, status, share_client, share_subs, deleted_at));
create policy sel_insert on public.selections for insert to authenticated with check (private.can_module(job_id, 'selections', 'add'));
create policy sel_update on public.selections for update to authenticated
  using (private.can_module(job_id, 'selections', 'edit') and status <> 'approved') with check (private.can_module(job_id, 'selections', 'edit'));

-- Clients read choices with prices; subs use selection_choices_public()
create policy choices_select on public.selection_choices for select to authenticated
  using (private.can_module(private.selection_job(selection_id), 'selections', 'view')
      or (private.is_job_client(private.selection_job(selection_id)) and public.can_see_selection(selection_id)));
create policy choices_write on public.selection_choices for all to authenticated
  using (private.can_module(private.selection_job(selection_id), 'selections', 'edit') and private.selection_open(selection_id))
  with check (private.can_module(private.selection_job(selection_id), 'selections', 'edit') and private.selection_open(selection_id));

create policy choice_costs_select on public.selection_choice_costs for select to authenticated
  using (private.can_module(private.selection_job(private.choice_selection(choice_id)), 'selections', 'view')
     and private.has_perm(private.job_org(private.selection_job(private.choice_selection(choice_id))), 'selections', 'cost'));
create policy choice_costs_write on public.selection_choice_costs for all to authenticated
  using (private.can_module(private.selection_job(private.choice_selection(choice_id)), 'selections', 'edit')
     and private.has_perm(private.job_org(private.selection_job(private.choice_selection(choice_id))), 'selections', 'cost'))
  with check (private.can_module(private.selection_job(private.choice_selection(choice_id)), 'selections', 'edit')
     and private.has_perm(private.job_org(private.selection_job(private.choice_selection(choice_id))), 'selections', 'cost'));

revoke all on public.selections, public.selection_choices, public.selection_choice_costs from anon;
