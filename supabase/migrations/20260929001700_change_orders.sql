-- =====================================================================
-- Change orders: priced changes to the contract, released to the client
-- for e-signature. Approval adds revised-budget lines and raises the
-- contract price. Clients can request changes when the job allows it.
-- =====================================================================

create type public.co_status as enum ('draft', 'pending', 'approved', 'declined');

-- Client portal setting for a job (job override, else company default)
create or replace function private.client_setting(p_job uuid, p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select settings -> p_key from public.job_client_permissions where job_id = p_job),
    (select d.settings -> p_key from public.client_permission_defaults d join public.jobs j on j.org_id = d.org_id where j.id = p_job),
    'null'::jsonb);
$$;
grant execute on function private.client_setting(uuid, text) to authenticated;

create table public.change_orders (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  job_id               uuid not null references public.jobs (id) on delete cascade,
  number               int not null,
  title                text not null check (length(trim(title)) between 1 and 200),
  description          text check (length(description) <= 8000),      -- client-visible
  status               public.co_status not null default 'draft',
  requested_by_client  boolean not null default false,
  approval_deadline    date,
  collect_signature    boolean not null default true,
  tax_rate             numeric(6,3) not null default 5,
  tax_label            text not null default 'GST',
  snapshot             jsonb,
  subtotal             numeric(14,2),
  tax                  numeric(14,2),
  total                numeric(14,2),
  created_by           uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at           timestamptz not null default now(),
  released_at          timestamptz,
  decided_at           timestamptz,
  unique (job_id, number)
);
create index change_orders_job on public.change_orders (job_id);

-- Builder-only fields, apart from the row clients can read
create table public.change_order_private (
  change_order_id     uuid primary key references public.change_orders (id) on delete cascade,
  internal_notes      text check (length(internal_notes) <= 8000),
  default_markup_pct  numeric(7,3) not null default 20
);

create table public.change_order_items (
  id               uuid primary key default gen_random_uuid(),
  change_order_id  uuid not null references public.change_orders (id) on delete cascade,
  cost_code_id     uuid references public.cost_codes (id) on delete set null,
  cost_type        public.cost_type not null default 'material',
  title            text not null check (length(trim(title)) between 1 and 200),
  description      text check (length(description) <= 4000),
  internal_notes   text check (length(internal_notes) <= 4000),
  quantity         numeric(14,4) not null default 1,
  unit             text not null default 'ea',
  unit_cost        numeric(14,4) not null default 0,       -- credits use negative quantity
  markup_type      public.markup_type not null default 'percent',
  markup_value     numeric(14,4) not null default 0,
  taxable          boolean not null default true,
  sort             int not null default 0
);
create index change_order_items_co on public.change_order_items (change_order_id, sort);

create or replace function public.co_item_price(i public.change_order_items)
returns numeric language sql immutable set search_path = '' as $$
  select round(i.quantity * i.unit_cost + case when i.markup_type = 'percent' then i.quantity * i.unit_cost * i.markup_value / 100 else i.markup_value end, 2)
$$;

create table public.change_order_signatures (
  id               uuid primary key default gen_random_uuid(),
  change_order_id  uuid not null references public.change_orders (id) on delete cascade,
  decision         text not null check (decision in ('approved', 'declined')),
  signer_name      text not null check (length(trim(signer_name)) between 1 and 120),
  signer_user_id   uuid references public.profiles (id) on delete set null,
  on_behalf        boolean not null default false,
  signature        text,
  comment          text,
  ip               text,
  user_agent       text,
  signed_at        timestamptz not null default now()
);

alter table public.budget_lines add column change_order_id uuid references public.change_orders (id) on delete cascade;

-- Numbering, org, locked fields; status only changes through the RPCs
create or replace function private.co_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  if tg_op = 'INSERT' then
    select org_id into new.org_id from public.jobs where id = new.job_id;
    perform pg_advisory_xact_lock(hashtext('co:' || new.job_id::text));
    select coalesce(max(number), 0) + 1 into new.number from public.change_orders where job_id = new.job_id;
    new.created_by := auth.uid();
    new.status := 'draft'; new.snapshot := null; new.released_at := null; new.decided_at := null;
    new.subtotal := null; new.tax := null; new.total := null;
    if private.is_job_internal(new.job_id) then
      new.requested_by_client := false;
      -- default tax from the job's estimate when there is one
      select tax_rate, tax_label into t from public.estimates where job_id = new.job_id;
      if found then new.tax_rate := t.tax_rate; new.tax_label := t.tax_label; end if;
    else
      new.requested_by_client := true;
    end if;
  else
    new.org_id := old.org_id; new.job_id := old.job_id; new.number := old.number; new.created_by := old.created_by;
    new.requested_by_client := old.requested_by_client; new.created_at := old.created_at;
    if current_setting('app.co_status', true) is distinct from 'on' then
      new.status := old.status; new.snapshot := old.snapshot; new.released_at := old.released_at; new.decided_at := old.decided_at;
      new.subtotal := old.subtotal; new.tax := old.tax; new.total := old.total;
    end if;
  end if;
  return new;
end $$;
create trigger change_orders_fill before insert or update on public.change_orders for each row execute function private.co_fill();

create or replace function private.co_private_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.change_order_private (change_order_id, default_markup_pct)
  values (new.id, coalesce((select default_markup_pct from public.estimates where job_id = new.job_id), 20));
  return null;
end $$;
create trigger change_orders_private after insert on public.change_orders for each row execute function private.co_private_row();

create or replace function private.co_visible(p_job uuid, p_status public.co_status, p_by_client boolean, p_created_by uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_module(p_job, 'change_orders', 'view')
      or (private.is_job_client(p_job) and (p_status <> 'draft' or (p_by_client and p_created_by = auth.uid())));
$$;
create or replace function private.co_job(p_co uuid)
returns uuid language sql stable security definer set search_path = '' as $$ select job_id from public.change_orders where id = p_co $$;
create or replace function private.co_is_draft(p_co uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select status = 'draft' from public.change_orders where id = p_co $$;
create or replace function public.can_see_change_order(p_co uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.change_orders c where c.id = p_co and private.co_visible(c.job_id, c.status, c.requested_by_client, c.created_by));
$$;
grant execute on function private.co_visible(uuid, public.co_status, boolean, uuid), private.co_job(uuid), private.co_is_draft(uuid) to authenticated;

-- Price-only lines for builder users without cost permission.
-- Subs don't see change orders (client pricing); their changes come through POs.
create or replace function public.co_price_lines(p_co uuid)
returns table (id uuid, title text, description text, quantity numeric, unit text, price numeric, taxable boolean, sort int)
language sql stable security definer set search_path = '' as $$
  select i.id, i.title, i.description, i.quantity, i.unit, public.co_item_price(i), i.taxable, i.sort
  from public.change_order_items i join public.change_orders c on c.id = i.change_order_id
  where i.change_order_id = p_co and private.can_module(c.job_id, 'change_orders', 'view')
  order by i.sort;
$$;

create or replace function public.save_change_order(p_co uuid, p_settings jsonb, p_items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare c public.change_orders;
begin
  select * into c from public.change_orders where id = p_co;
  if c.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if c.status <> 'draft' then raise exception 'Only draft change orders can be changed.' using errcode = '55000'; end if;
  update public.change_orders set
    tax_rate = coalesce((p_settings->>'tax_rate')::numeric, tax_rate),
    tax_label = coalesce(nullif(trim(p_settings->>'tax_label'), ''), tax_label)
  where id = p_co;
  update public.change_order_private set default_markup_pct = coalesce((p_settings->>'default_markup_pct')::numeric, default_markup_pct)
  where change_order_id = p_co;
  delete from public.change_order_items where change_order_id = p_co
    and id not in (select (v->>'id')::uuid from jsonb_array_elements(coalesce(p_items, '[]')) v);
  insert into public.change_order_items as i (id, change_order_id, cost_code_id, cost_type, title, description, internal_notes,
    quantity, unit, unit_cost, markup_type, markup_value, taxable, sort)
  select x.id, p_co, x.cost_code_id, coalesce(x.cost_type, 'material')::public.cost_type, x.title, nullif(x.description, ''), nullif(x.internal_notes, ''),
    coalesce(x.quantity, 1), coalesce(nullif(x.unit, ''), 'ea'), coalesce(x.unit_cost, 0), coalesce(x.markup_type, 'percent')::public.markup_type,
    coalesce(x.markup_value, 0), coalesce(x.taxable, true), x.sort
  from jsonb_to_recordset(coalesce(p_items, '[]')) as x(id uuid, cost_code_id uuid, cost_type text, title text, description text,
    internal_notes text, quantity numeric, unit text, unit_cost numeric, markup_type text, markup_value numeric, taxable boolean, sort int)
  on conflict (id) do update set cost_code_id = excluded.cost_code_id, cost_type = excluded.cost_type,
    title = excluded.title, description = excluded.description, internal_notes = excluded.internal_notes, quantity = excluded.quantity,
    unit = excluded.unit, unit_cost = excluded.unit_cost, markup_type = excluded.markup_type, markup_value = excluded.markup_value,
    taxable = excluded.taxable, sort = excluded.sort
    where i.change_order_id = p_co;
end $$;

create or replace function public.release_change_order(p_co uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.change_orders; v_snap jsonb; v_sub numeric; v_tax numeric;
begin
  select * into c from public.change_orders where id = p_co for update;
  if c.id is null or not private.can_module(c.job_id, 'change_orders', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if c.status <> 'draft' then raise exception 'Only drafts can be released' using errcode = '22023'; end if;
  if not exists (select 1 from public.change_order_items where change_order_id = p_co) then raise exception 'Add at least one line before releasing' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('title', i.title, 'description', i.description, 'quantity', i.quantity, 'unit', i.unit,
           'price', public.co_item_price(i), 'taxable', i.taxable) order by i.sort),
         sum(public.co_item_price(i)), coalesce(sum(case when i.taxable then public.co_item_price(i) end), 0) * c.tax_rate / 100
    into v_snap, v_sub, v_tax
  from public.change_order_items i where i.change_order_id = p_co;
  perform set_config('app.co_status', 'on', true);
  update public.change_orders set status = 'pending', released_at = now(), snapshot = v_snap,
    subtotal = round(v_sub, 2), tax = round(v_tax, 2), total = round(v_sub + v_tax, 2)
  where id = p_co;
  perform set_config('app.co_status', 'off', true);
  perform private.notify((select coalesce(array_agg(user_id), '{}') from public.job_clients where job_id = c.job_id and user_id is not null),
    c.org_id, c.job_id, 'change_order.released', 'Change order #' || c.number || ' needs your approval: ' || c.title, null, '/change-orders/' || c.id);
end $$;

create or replace function public.decide_change_order(p_co uuid, p_decision text, p_signer_name text, p_signature text, p_comment text default null, p_ip text default null, p_ua text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.change_orders; v_behalf boolean;
begin
  select * into c from public.change_orders where id = p_co for update;
  if c.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if c.status <> 'pending' then raise exception 'This change order is not open for approval' using errcode = '22023'; end if;
  if p_decision not in ('approved', 'declined') then raise exception 'Bad decision' using errcode = '22023'; end if;
  if private.is_job_client(c.job_id) then v_behalf := false;
  elsif private.can_module(c.job_id, 'change_orders', 'edit') and private.has_action(c.org_id, 'change_orders.approve_for_client') then v_behalf := true;
  else raise exception 'Not allowed' using errcode = '42501'; end if;
  if c.collect_signature and p_decision = 'approved' and coalesce(trim(p_signature), '') = '' then
    raise exception 'A signature is required' using errcode = '23514';
  end if;
  insert into public.change_order_signatures (change_order_id, decision, signer_name, signer_user_id, on_behalf, signature, comment, ip, user_agent)
  values (p_co, p_decision, trim(p_signer_name), auth.uid(), v_behalf, p_signature, p_comment, p_ip, p_ua);
  perform set_config('app.co_status', 'on', true);
  update public.change_orders set status = p_decision::public.co_status, decided_at = now() where id = p_co;
  perform set_config('app.co_status', 'off', true);
  if p_decision = 'approved' then
    insert into public.budget_lines (org_id, job_id, cost_code_id, cost_type, original_cost, original_price, source, change_order_id)
    select c.org_id, c.job_id, i.cost_code_id, i.cost_type, sum(round(i.quantity * i.unit_cost, 2)), sum(public.co_item_price(i)), 'change_order', c.id
    from public.change_order_items i where i.change_order_id = p_co
    group by i.cost_code_id, i.cost_type;
    update public.job_private set contract_price = (select sum(original_price) from public.budget_lines where job_id = c.job_id) where job_id = c.job_id;
  end if;
  perform private.notify((select coalesce(array_agg(user_id), '{}') from public.job_managers where job_id = c.job_id) || array[c.created_by],
    c.org_id, c.job_id, 'change_order.decided', 'Change order #' || c.number || ' ' || p_decision || ': ' || c.title, p_comment, '/change-orders/' || c.id);
end $$;

-- Notify the job managers when a client requests a change
create or replace function private.ntf_co_requested()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.requested_by_client then
    -- job managers, or whoever created the job when it has no manager yet
    perform private.notify(coalesce((select array_agg(user_id) from public.job_managers where job_id = new.job_id),
                                    (select array[created_by] from public.jobs where id = new.job_id)),
      new.org_id, new.job_id, 'change_order.requested', 'Change requested: ' || new.title, new.description, '/change-orders/' || new.id);
  end if;
  return null;
end $$;
create trigger change_orders_ntf after insert on public.change_orders for each row execute function private.ntf_co_requested();

do $$ declare f text; begin
  foreach f in array array['co_price_lines(uuid)', 'save_change_order(uuid, jsonb, jsonb)', 'release_change_order(uuid)',
    'decide_change_order(uuid, text, text, text, text, text, text)', 'can_see_change_order(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

insert into public.app_notification_types (key, grp, module, label, sort) values
  ('change_order.released', 'Project Management', 'Change orders', 'Change order needs approval', 20),
  ('change_order.decided', 'Project Management', 'Change orders', 'Change order approved or declined', 21),
  ('change_order.requested', 'Project Management', 'Change orders', 'Client requested a change', 22);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.change_orders enable row level security;
alter table public.change_order_items enable row level security;
alter table public.change_order_signatures enable row level security;
alter table public.change_order_private enable row level security;
create policy co_private_select on public.change_order_private for select to authenticated using (private.can_module(private.co_job(change_order_id), 'change_orders', 'view'));
create policy co_private_update on public.change_order_private for update to authenticated
  using (private.can_module(private.co_job(change_order_id), 'change_orders', 'edit') and private.co_is_draft(change_order_id))
  with check (private.can_module(private.co_job(change_order_id), 'change_orders', 'edit'));

create policy co_select on public.change_orders for select to authenticated
  using (private.co_visible(job_id, status, requested_by_client, created_by));
create policy co_insert on public.change_orders for insert to authenticated
  with check (private.can_module(job_id, 'change_orders', 'add')
           or (private.is_job_client(job_id) and private.client_setting(job_id, 'submit_change_orders') = 'true'::jsonb));
create policy co_update on public.change_orders for update to authenticated
  using (status = 'draft' and private.can_module(job_id, 'change_orders', 'edit')) with check (status = 'draft');
create policy co_delete on public.change_orders for delete to authenticated
  using (status = 'draft' and private.can_module(job_id, 'change_orders', 'delete'));

create policy co_items_select on public.change_order_items for select to authenticated
  using (private.can_module(private.co_job(change_order_id), 'change_orders', 'view')
     and private.has_perm(private.job_org(private.co_job(change_order_id)), 'change_orders', 'cost'));
create policy co_items_write on public.change_order_items for all to authenticated
  using (private.can_module(private.co_job(change_order_id), 'change_orders', 'edit') and private.co_is_draft(change_order_id))
  with check (private.can_module(private.co_job(change_order_id), 'change_orders', 'edit') and private.co_is_draft(change_order_id));

create policy co_sigs_select on public.change_order_signatures for select to authenticated
  using (public.can_see_change_order(change_order_id));

revoke all on public.change_orders, public.change_order_items, public.change_order_signatures, public.change_order_private from anon;

-- Lets the client portal ask what it may do on a job
create or replace function public.client_can(p_job uuid, p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_job_client(p_job) and private.client_setting(p_job, p_key) = 'true'::jsonb;
$$;
revoke execute on function public.client_can(uuid, text) from public, anon;
grant execute on function public.client_can(uuid, text) to authenticated;
