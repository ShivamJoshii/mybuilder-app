-- =====================================================================
-- Bids → purchase orders → bills (with Canadian holdback and lien waivers)
--  * Bid packages go to linked subs/vendors (job assignment not needed,
--    presale jobs included). Subs price each line; the builder compares
--    and awards, which drafts a PO at the bid prices.
--  * POs commit cost. Released POs are accepted (signed) or declined by
--    the sub. Work status is tracked.
--  * Bills record what the sub invoices against a PO (or standalone).
--    Holdback (default 10%) is withheld on each bill and released later.
--    A lien waiver can be required before payment.
-- Money here is builder cost; everything needs the module's cost view.
-- =====================================================================

create type public.bid_package_status as enum ('draft', 'open', 'closed', 'awarded');
create type public.bid_request_status as enum ('invited', 'submitted', 'declined', 'awarded', 'not_awarded');
create type public.po_status as enum ('draft', 'released', 'accepted', 'declined', 'void');
create type public.work_status as enum ('not_started', 'in_progress', 'complete');
create type public.bill_status as enum ('draft', 'submitted', 'approved', 'paid', 'rejected');

-- Caller is an active member of this sub org, and the sub is linked to the builder
create or replace function private.is_my_linked_sub(p_builder uuid, p_sub uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_member(p_sub) and exists (
    select 1 from public.builder_sub_links l where l.builder_org_id = p_builder and l.sub_org_id = p_sub and l.status = 'active');
$$;
grant execute on function private.is_my_linked_sub(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Bids
-- ---------------------------------------------------------------------
create table public.bid_packages (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  job_id       uuid not null references public.jobs (id) on delete cascade,
  number       int not null,
  title        text not null check (length(trim(title)) between 1 and 200),
  scope        text check (length(scope) <= 20000),
  due_at       timestamptz,
  status       public.bid_package_status not null default 'draft',
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  released_at  timestamptz,
  deleted_at   timestamptz,
  unique (job_id, number)
);
create table public.bid_package_items (
  id           uuid primary key default gen_random_uuid(),
  package_id   uuid not null references public.bid_packages (id) on delete cascade,
  cost_code_id uuid references public.cost_codes (id) on delete set null,
  cost_type    public.cost_type not null default 'subcontractor',
  title        text not null check (length(trim(title)) between 1 and 200),
  description  text check (length(description) <= 4000),
  quantity     numeric(14,4) not null default 1,
  unit         text not null default 'ls',
  sort         int not null default 0
);
create table public.bid_requests (
  id              uuid primary key default gen_random_uuid(),
  package_id      uuid not null references public.bid_packages (id) on delete cascade,
  sub_org_id      uuid not null references public.organizations (id) on delete cascade,
  status          public.bid_request_status not null default 'invited',
  notes           text check (length(notes) <= 8000),
  decline_reason  text check (length(decline_reason) <= 2000),
  total           numeric(14,2),
  submitted_at    timestamptz,
  submitted_by    uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (package_id, sub_org_id)
);
create table public.bid_request_prices (
  request_id  uuid not null references public.bid_requests (id) on delete cascade,
  item_id     uuid not null references public.bid_package_items (id) on delete cascade,
  unit_cost   numeric(14,4) not null check (unit_cost >= 0),
  notes       text check (length(notes) <= 1000),
  primary key (request_id, item_id)
);

create or replace function private.bid_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select org_id into new.org_id from public.jobs where id = new.job_id;
    perform pg_advisory_xact_lock(hashtext('bid:' || new.job_id::text));
    select coalesce(max(number), 0) + 1 into new.number from public.bid_packages where job_id = new.job_id;
    new.created_by := auth.uid(); new.status := 'draft'; new.released_at := null;
  else
    new.org_id := old.org_id; new.job_id := old.job_id; new.number := old.number; new.created_by := old.created_by;
    if current_setting('app.bid_status', true) is distinct from 'on' then new.status := old.status; new.released_at := old.released_at; end if;
  end if;
  return new;
end $$;
create trigger bid_packages_fill before insert or update on public.bid_packages for each row execute function private.bid_fill();

create or replace function private.bid_pkg(p_package uuid)
returns public.bid_packages language sql stable security definer set search_path = '' as $$ select * from public.bid_packages where id = p_package $$;
create or replace function private.bid_internal(p_package uuid, p_verb text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_module(p.job_id, 'bids', p_verb) and private.has_perm(p.org_id, 'bids', 'cost') from public.bid_packages p where p.id = p_package;
$$;
-- A sub sees a package once it is out, if their company was invited
create or replace function private.bid_sub_request(p_package uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select r.id from public.bid_requests r join public.bid_packages p on p.id = r.package_id
  where r.package_id = p_package and p.status <> 'draft' and p.deleted_at is null and private.is_my_linked_sub(p.org_id, r.sub_org_id) limit 1;
$$;
grant execute on function private.bid_pkg(uuid), private.bid_internal(uuid, text), private.bid_sub_request(uuid) to authenticated;

create or replace function public.release_bid_package(p_package uuid, p_due timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.bid_packages; v_users uuid[];
begin
  select * into p from public.bid_packages where id = p_package for update;
  if p.id is null or not private.bid_internal(p_package, 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.status <> 'draft' then raise exception 'Already released' using errcode = '22023'; end if;
  if not exists (select 1 from public.bid_package_items where package_id = p_package) then raise exception 'Add at least one line to price' using errcode = '22023'; end if;
  if not exists (select 1 from public.bid_requests where package_id = p_package) then raise exception 'Invite at least one sub or vendor' using errcode = '22023'; end if;
  perform set_config('app.bid_status', 'on', true);
  update public.bid_packages set status = 'open', released_at = now(), due_at = coalesce(p_due, due_at) where id = p_package;
  perform set_config('app.bid_status', 'off', true);
  select coalesce(array_agg(distinct m.user_id), '{}') into v_users from public.bid_requests r join public.org_members m on m.org_id = r.sub_org_id and m.status = 'active' where r.package_id = p_package;
  perform private.notify(v_users, p.org_id, p.job_id, 'bid.invited', 'Bid request: ' || p.title, null, '/bids/' || p.id);
end $$;

-- Sub submits (or updates) prices for every line
create or replace function public.submit_bid(p_request uuid, p_prices jsonb, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.bid_requests; p public.bid_packages; v_total numeric;
begin
  select * into r from public.bid_requests where id = p_request for update;
  select * into p from public.bid_packages where id = r.package_id;
  if r.id is null or not private.is_my_linked_sub(p.org_id, r.sub_org_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.status <> 'open' or r.status not in ('invited', 'submitted') then raise exception 'This bid is closed' using errcode = '22023'; end if;
  if p.due_at is not null and now() > p.due_at then raise exception 'The bid deadline has passed' using errcode = '22023'; end if;
  delete from public.bid_request_prices where request_id = p_request;
  insert into public.bid_request_prices (request_id, item_id, unit_cost, notes)
  select p_request, x.item_id, x.unit_cost, nullif(x.notes, '')
  from jsonb_to_recordset(p_prices) as x(item_id uuid, unit_cost numeric, notes text)
  join public.bid_package_items i on i.id = x.item_id and i.package_id = p.id;
  if (select count(*) from public.bid_request_prices where request_id = p_request) <> (select count(*) from public.bid_package_items where package_id = p.id) then
    raise exception 'Price every line' using errcode = '23514';
  end if;
  select sum(round(i.quantity * bp.unit_cost, 2)) into v_total from public.bid_request_prices bp join public.bid_package_items i on i.id = bp.item_id where bp.request_id = p_request;
  update public.bid_requests set status = 'submitted', total = v_total, notes = p_notes, submitted_at = now(), submitted_by = auth.uid(), decline_reason = null where id = p_request;
  perform private.notify(coalesce((select array_agg(user_id) from public.job_managers where job_id = p.job_id), '{}') || array[p.created_by], p.org_id, p.job_id,
    'bid.submitted', 'Bid received: ' || p.title, (select name from public.organizations where id = r.sub_org_id) || ' · ' || to_char(v_total, 'FM$999,999,990.00'), '/bids/' || p.id);
end $$;

create or replace function public.decline_bid(p_request uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.bid_requests; p public.bid_packages;
begin
  select * into r from public.bid_requests where id = p_request for update;
  select * into p from public.bid_packages where id = r.package_id;
  if r.id is null or not private.is_my_linked_sub(p.org_id, r.sub_org_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.status <> 'open' then raise exception 'This bid is closed' using errcode = '22023'; end if;
  delete from public.bid_request_prices where request_id = p_request;
  update public.bid_requests set status = 'declined', decline_reason = p_reason, total = null, submitted_at = now(), submitted_by = auth.uid() where id = p_request;
end $$;

-- ---------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------
create table public.purchase_orders (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  job_id            uuid not null references public.jobs (id) on delete cascade,
  number            int not null,
  title             text not null check (length(trim(title)) between 1 and 200),
  scope             text check (length(scope) <= 20000),
  sub_org_id        uuid references public.organizations (id) on delete restrict,
  vendor_name       text check (length(vendor_name) <= 200),        -- one-off vendor without a portal account
  status            public.po_status not null default 'draft',
  work_status       public.work_status not null default 'not_started',
  holdback_pct      numeric(5,2) not null default 10 check (holdback_pct between 0 and 100),
  lien_waiver_required boolean not null default false,
  bid_request_id    uuid references public.bid_requests (id) on delete set null,
  created_by        uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at        timestamptz not null default now(),
  released_at       timestamptz,
  decided_at        timestamptz,
  decided_by        uuid references public.profiles (id) on delete set null,
  signer_name       text,
  signature         text,
  decline_reason    text check (length(decline_reason) <= 2000),
  deleted_at        timestamptz,
  unique (job_id, number),
  check (sub_org_id is not null or vendor_name is not null)
);
create index purchase_orders_job on public.purchase_orders (job_id) where deleted_at is null;
create index purchase_orders_sub on public.purchase_orders (sub_org_id) where deleted_at is null;
create table public.po_items (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references public.purchase_orders (id) on delete cascade,
  cost_code_id  uuid references public.cost_codes (id) on delete set null,
  cost_type     public.cost_type not null default 'subcontractor',
  title         text not null check (length(trim(title)) between 1 and 200),
  description   text check (length(description) <= 4000),
  quantity      numeric(14,4) not null default 1,
  unit          text not null default 'ls',
  unit_cost     numeric(14,4) not null default 0,
  sort          int not null default 0
);
create index po_items_po on public.po_items (po_id, sort);

create or replace function private.po_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select org_id into new.org_id from public.jobs where id = new.job_id;
    perform pg_advisory_xact_lock(hashtext('po:' || new.job_id::text));
    select coalesce(max(number), 0) + 1 into new.number from public.purchase_orders where job_id = new.job_id;
    new.created_by := auth.uid(); new.status := 'draft'; new.released_at := null; new.decided_at := null; new.decided_by := null;
    new.signer_name := null; new.signature := null;
  else
    new.org_id := old.org_id; new.job_id := old.job_id; new.number := old.number; new.created_by := old.created_by; new.bid_request_id := old.bid_request_id;
    if current_setting('app.po_status', true) is distinct from 'on' then
      new.status := old.status; new.released_at := old.released_at; new.decided_at := old.decided_at; new.decided_by := old.decided_by;
      new.signer_name := old.signer_name; new.signature := old.signature; new.decline_reason := old.decline_reason;
    end if;
  end if;
  if new.sub_org_id is not null and not exists (select 1 from public.builder_sub_links where builder_org_id = new.org_id and sub_org_id = new.sub_org_id) then
    raise exception 'That sub or vendor is not linked to your company' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger purchase_orders_fill before insert or update on public.purchase_orders for each row execute function private.po_fill();

create or replace function private.po_row(p_po uuid)
returns public.purchase_orders language sql stable security definer set search_path = '' as $$ select * from public.purchase_orders where id = p_po $$;
create or replace function private.po_internal(p_job uuid, p_org uuid, p_verb text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_module(p_job, 'purchase_orders', p_verb) and private.has_perm(p_org, 'purchase_orders', 'cost');
$$;
create or replace function private.po_visible(p_org uuid, p_job uuid, p_sub uuid, p_status public.po_status, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.po_internal(p_job, p_org, 'view')
      or (p_deleted is null and p_status <> 'draft' and p_sub is not null and private.is_my_linked_sub(p_org, p_sub));
$$;
create or replace function public.can_see_po(p_po uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.purchase_orders p where p.id = p_po and private.po_visible(p.org_id, p.job_id, p.sub_org_id, p.status, p.deleted_at));
$$;
grant execute on function private.po_row(uuid), private.po_internal(uuid, uuid, text), private.po_visible(uuid, uuid, uuid, public.po_status, timestamptz) to authenticated;

create or replace function public.po_total(p_po uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(round(quantity * unit_cost, 2)), 0) from public.po_items where po_id = p_po and public.can_see_po(p_po);
$$;

create or replace function public.award_bid(p_request uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.bid_requests; p public.bid_packages; v_po uuid;
begin
  select * into r from public.bid_requests where id = p_request for update;
  select * into p from public.bid_packages where id = r.package_id for update;
  if r.id is null or not private.bid_internal(p.id, 'edit') or not private.can_module(p.job_id, 'purchase_orders', 'add') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if r.status <> 'submitted' then raise exception 'Only submitted bids can be awarded' using errcode = '22023'; end if;
  update public.bid_requests set status = case when id = p_request then 'awarded'::public.bid_request_status else 'not_awarded'::public.bid_request_status end
    where package_id = p.id and status in ('submitted', 'invited');
  perform set_config('app.bid_status', 'on', true);
  update public.bid_packages set status = 'awarded' where id = p.id;
  perform set_config('app.bid_status', 'off', true);
  insert into public.purchase_orders (org_id, job_id, number, title, scope, sub_org_id, bid_request_id)
  values (p.org_id, p.job_id, 0, p.title, p.scope, r.sub_org_id, p_request) returning id into v_po;
  insert into public.po_items (po_id, cost_code_id, cost_type, title, description, quantity, unit, unit_cost, sort)
  select v_po, i.cost_code_id, i.cost_type, i.title, i.description, i.quantity, i.unit, bp.unit_cost, i.sort
  from public.bid_package_items i join public.bid_request_prices bp on bp.item_id = i.id and bp.request_id = p_request
  where i.package_id = p.id;
  perform private.notify((select coalesce(array_agg(user_id), '{}') from public.org_members where org_id = r.sub_org_id and status = 'active'),
    p.org_id, p.job_id, 'bid.awarded', 'You won the bid: ' || p.title, 'A purchase order will follow.', '/bids/' || p.id);
  return v_po;
end $$;

create or replace function public.release_po(p_po uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.purchase_orders;
begin
  select * into p from public.purchase_orders where id = p_po for update;
  if p.id is null or not private.po_internal(p.job_id, p.org_id, 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.status <> 'draft' then raise exception 'Only drafts can be released' using errcode = '22023'; end if;
  if not exists (select 1 from public.po_items where po_id = p_po) then raise exception 'Add at least one line' using errcode = '22023'; end if;
  perform set_config('app.po_status', 'on', true);
  -- one-off vendors without a portal account are accepted on release
  if p.sub_org_id is null then
    update public.purchase_orders set status = 'accepted', released_at = now(), decided_at = now(), decided_by = auth.uid() where id = p_po;
  else
    update public.purchase_orders set status = 'released', released_at = now() where id = p_po;
  end if;
  perform set_config('app.po_status', 'off', true);
  if p.sub_org_id is not null then
    -- a sub with work on the job is on the job (schedule, files, RFIs)
    insert into public.job_subs (job_id, sub_org_id) values (p.job_id, p.sub_org_id) on conflict do nothing;
    perform private.notify((select coalesce(array_agg(user_id), '{}') from public.org_members where org_id = p.sub_org_id and status = 'active'),
      p.org_id, p.job_id, 'po.released', 'Purchase order #' || p.number || ': ' || p.title, 'Review and accept the work.', '/purchase-orders/' || p.id);
  end if;
end $$;

-- Sub accepts (signs) or declines; the builder can also record it for them
create or replace function public.decide_po(p_po uuid, p_decision text, p_signer_name text, p_signature text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.purchase_orders;
begin
  select * into p from public.purchase_orders where id = p_po for update;
  if p.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if not (private.is_my_linked_sub(p.org_id, p.sub_org_id) or private.po_internal(p.job_id, p.org_id, 'edit')) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.status <> 'released' then raise exception 'This purchase order is not waiting for a decision' using errcode = '22023'; end if;
  if p_decision not in ('accepted', 'declined') then raise exception 'Bad decision' using errcode = '22023'; end if;
  if p_decision = 'accepted' and coalesce(trim(p_signature), '') = '' then raise exception 'A signature is required' using errcode = '23514'; end if;
  perform set_config('app.po_status', 'on', true);
  update public.purchase_orders set status = p_decision::public.po_status, decided_at = now(), decided_by = auth.uid(),
    signer_name = trim(p_signer_name), signature = p_signature, decline_reason = p_reason where id = p_po;
  perform set_config('app.po_status', 'off', true);
  perform private.notify(coalesce((select array_agg(user_id) from public.job_managers where job_id = p.job_id), '{}') || array[p.created_by],
    p.org_id, p.job_id, 'po.decided', 'PO #' || p.number || ' ' || p_decision || ': ' || p.title, p_reason, '/purchase-orders/' || p.id);
end $$;

create or replace function public.set_po_work_status(p_po uuid, p_status public.work_status)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.purchase_orders;
begin
  select * into p from public.purchase_orders where id = p_po;
  if p.id is null or not (private.is_my_linked_sub(p.org_id, p.sub_org_id) or private.po_internal(p.job_id, p.org_id, 'edit')) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.status <> 'accepted' then raise exception 'Accept the purchase order first' using errcode = '22023'; end if;
  update public.purchase_orders set work_status = p_status where id = p_po;
  if p_status = 'complete' and private.is_my_linked_sub(p.org_id, p.sub_org_id) then
    perform private.notify(coalesce((select array_agg(user_id) from public.job_managers where job_id = p.job_id), '{}') || array[p.created_by],
      p.org_id, p.job_id, 'po.decided', 'Work complete on PO #' || p.number || ': ' || p.title, null, '/purchase-orders/' || p.id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Bills
-- ---------------------------------------------------------------------
create table public.bills (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  job_id               uuid not null references public.jobs (id) on delete cascade,
  po_id                uuid references public.purchase_orders (id) on delete restrict,
  sub_org_id           uuid references public.organizations (id) on delete restrict,
  vendor_name          text check (length(vendor_name) <= 200),
  number               int not null,
  invoice_ref          text check (length(invoice_ref) <= 60),
  title                text not null check (length(trim(title)) between 1 and 200),
  invoice_date         date not null default current_date,
  due_date             date,
  status               public.bill_status not null default 'draft',
  tax_amount           numeric(14,2) not null default 0 check (tax_amount >= 0),
  holdback_pct         numeric(5,2) not null default 0 check (holdback_pct between 0 and 100),
  is_holdback_release  boolean not null default false,
  lien_waiver_required boolean not null default false,
  lien_waiver_received_at timestamptz,
  lien_waiver_file_id  uuid references public.files (id) on delete set null,
  submitted_by_sub     boolean not null default false,
  approved_at          timestamptz,
  approved_by          uuid references public.profiles (id) on delete set null,
  rejected_reason      text check (length(rejected_reason) <= 2000),
  paid_at              date,
  paid_amount          numeric(14,2),
  payment_method       text check (payment_method in ('eft', 'cheque', 'credit_card', 'cash', 'other')),
  payment_ref          text check (length(payment_ref) <= 80),
  created_by           uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  unique (job_id, number)
);
create index bills_job on public.bills (job_id) where deleted_at is null;
create index bills_po on public.bills (po_id);
create table public.bill_items (
  id            uuid primary key default gen_random_uuid(),
  bill_id       uuid not null references public.bills (id) on delete cascade,
  po_item_id    uuid references public.po_items (id) on delete set null,
  cost_code_id  uuid references public.cost_codes (id) on delete set null,
  cost_type     public.cost_type not null default 'subcontractor',
  title         text not null check (length(trim(title)) between 1 and 200),
  amount        numeric(14,2) not null,
  sort          int not null default 0
);
create index bill_items_bill on public.bill_items (bill_id);

create or replace function public.bill_subtotal(p_bill uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount), 0) from public.bill_items where bill_id = p_bill;
$$;
create or replace function public.bill_holdback(p_bill uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select round(public.bill_subtotal(b.id) * b.holdback_pct / 100, 2) from public.bills b where b.id = p_bill;
$$;

create or replace function private.bill_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare po public.purchase_orders;
begin
  if tg_op = 'INSERT' then
    select org_id into new.org_id from public.jobs where id = new.job_id;
    perform pg_advisory_xact_lock(hashtext('bill:' || new.job_id::text));
    select coalesce(max(number), 0) + 1 into new.number from public.bills where job_id = new.job_id;
    new.created_by := auth.uid(); new.approved_at := null; new.approved_by := null; new.paid_at := null; new.paid_amount := null;
    new.lien_waiver_received_at := null;
    if new.po_id is not null then
      select * into po from public.purchase_orders where id = new.po_id;
      if po.job_id is distinct from new.job_id then raise exception 'PO is on another job' using errcode = '23514'; end if;
      if po.status <> 'accepted' then raise exception 'Bill against an accepted purchase order' using errcode = '22023'; end if;
      new.sub_org_id := po.sub_org_id; new.vendor_name := po.vendor_name;
      new.lien_waiver_required := new.lien_waiver_required or po.lien_waiver_required;
      if not new.is_holdback_release then new.holdback_pct := po.holdback_pct; end if;
    end if;
    if private.bill_internal(new.job_id, new.org_id, 'add') then
      new.submitted_by_sub := false;
      if new.status not in ('draft', 'approved') then new.status := 'draft'; end if;
      if new.status = 'approved' then new.approved_at := now(); new.approved_by := auth.uid(); end if;
    else
      -- a sub invoicing its own PO
      if new.po_id is null or not private.is_my_linked_sub(new.org_id, new.sub_org_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
      new.submitted_by_sub := true; new.status := 'submitted'; new.is_holdback_release := false;
    end if;
    if new.sub_org_id is null and new.vendor_name is null then raise exception 'Pick a sub or vendor' using errcode = '23514'; end if;
  else
    new.org_id := old.org_id; new.job_id := old.job_id; new.number := old.number; new.created_by := old.created_by; new.po_id := old.po_id;
    new.sub_org_id := old.sub_org_id; new.submitted_by_sub := old.submitted_by_sub; new.is_holdback_release := old.is_holdback_release;
    if current_setting('app.bill_status', true) is distinct from 'on' then
      new.status := old.status; new.approved_at := old.approved_at; new.approved_by := old.approved_by; new.paid_at := old.paid_at;
      new.paid_amount := old.paid_amount; new.payment_method := old.payment_method; new.payment_ref := old.payment_ref;
      new.lien_waiver_received_at := old.lien_waiver_received_at; new.rejected_reason := old.rejected_reason;
    end if;
  end if;
  return new;
end $$;
create trigger bills_fill before insert or update on public.bills for each row execute function private.bill_fill();

create or replace function private.bill_row(p_bill uuid)
returns public.bills language sql stable security definer set search_path = '' as $$ select * from public.bills where id = p_bill $$;
create or replace function private.bill_internal(p_job uuid, p_org uuid, p_verb text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_module(p_job, 'bills', p_verb) and private.has_perm(p_org, 'bills', 'cost');
$$;
create or replace function private.bill_visible(p_org uuid, p_job uuid, p_sub uuid, p_status public.bill_status, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.bill_internal(p_job, p_org, 'view')
      or (p_deleted is null and p_sub is not null and p_status <> 'draft' and private.is_my_linked_sub(p_org, p_sub));
$$;
create or replace function public.can_see_bill(p_bill uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bills b where b.id = p_bill and private.bill_visible(b.org_id, b.job_id, b.sub_org_id, b.status, b.deleted_at));
$$;
grant execute on function private.bill_row(uuid), private.bill_internal(uuid, uuid, text), private.bill_visible(uuid, uuid, uuid, public.bill_status, timestamptz) to authenticated;

-- Billed-to-date guard: a PO line can't be billed past its value
create or replace function private.bill_item_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_line numeric; v_billed numeric; b public.bills;
begin
  select * into b from public.bills where id = new.bill_id;
  if b.status not in ('draft', 'submitted') then raise exception 'This bill is locked' using errcode = '55000'; end if;
  if new.po_item_id is not null then
    select round(quantity * unit_cost, 2) into v_line from public.po_items where id = new.po_item_id and po_id = b.po_id;
    if v_line is null then raise exception 'Line is not on this purchase order' using errcode = '23514'; end if;
    select coalesce(sum(bi.amount), 0) into v_billed from public.bill_items bi join public.bills x on x.id = bi.bill_id
      where bi.po_item_id = new.po_item_id and bi.id <> new.id and x.status <> 'rejected' and x.deleted_at is null and not x.is_holdback_release;
    if not b.is_holdback_release and v_billed + new.amount > v_line + 0.005 then
      raise exception 'Billing % would exceed the PO line (% of % already billed)', new.amount, v_billed, v_line using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger bill_items_check before insert or update on public.bill_items for each row execute function private.bill_item_check();

create or replace function public.set_bill_status(p_bill uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.bills;
begin
  select * into b from public.bills where id = p_bill for update;
  if b.id is null or not private.bill_internal(b.job_id, b.org_id, 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform set_config('app.bill_status', 'on', true);
  case p_action
    when 'approve' then
      if b.status not in ('draft', 'submitted') then raise exception 'Only draft or submitted bills can be approved' using errcode = '22023'; end if;
      if public.bill_subtotal(p_bill) = 0 then raise exception 'Add at least one line' using errcode = '22023'; end if;
      update public.bills set status = 'approved', approved_at = now(), approved_by = auth.uid(), rejected_reason = null where id = p_bill;
    when 'reject' then
      if b.status <> 'submitted' then raise exception 'Only submitted bills can be rejected' using errcode = '22023'; end if;
      update public.bills set status = 'rejected', rejected_reason = p_reason where id = p_bill;
    when 'unapprove' then
      if b.status <> 'approved' then raise exception 'Not approved' using errcode = '22023'; end if;
      update public.bills set status = case when b.submitted_by_sub then 'submitted'::public.bill_status else 'draft'::public.bill_status end, approved_at = null, approved_by = null where id = p_bill;
    when 'lien_waiver' then
      update public.bills set lien_waiver_received_at = now() where id = p_bill;
    else raise exception 'Bad action' using errcode = '22023';
  end case;
  perform set_config('app.bill_status', 'off', true);
  if p_action in ('approve', 'reject') and b.sub_org_id is not null then
    perform private.notify((select coalesce(array_agg(user_id), '{}') from public.org_members where org_id = b.sub_org_id and status = 'active'),
      b.org_id, b.job_id, 'bill.updated', 'Bill ' || coalesce(b.invoice_ref, '#' || b.number) || ' ' || case when p_action = 'approve' then 'approved' else 'rejected' end, p_reason, '/bills/' || b.id);
  end if;
end $$;

-- Record a payment (money moves outside the app for now)
create or replace function public.pay_bill(p_bill uuid, p_paid_on date, p_method text, p_ref text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare b public.bills; v_amount numeric;
begin
  select * into b from public.bills where id = p_bill for update;
  if b.id is null or not private.bill_internal(b.job_id, b.org_id, 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if b.status <> 'approved' then raise exception 'Approve the bill before paying it' using errcode = '22023'; end if;
  if b.lien_waiver_required and b.lien_waiver_received_at is null then raise exception 'A lien waiver is required before payment' using errcode = '22023'; end if;
  v_amount := public.bill_subtotal(p_bill) + b.tax_amount - public.bill_holdback(p_bill);
  perform set_config('app.bill_status', 'on', true);
  update public.bills set status = 'paid', paid_at = p_paid_on, paid_amount = v_amount, payment_method = p_method, payment_ref = p_ref where id = p_bill;
  perform set_config('app.bill_status', 'off', true);
  if b.sub_org_id is not null then
    perform private.notify((select coalesce(array_agg(user_id), '{}') from public.org_members where org_id = b.sub_org_id and status = 'active'),
      b.org_id, b.job_id, 'bill.updated', 'Payment sent: ' || to_char(v_amount, 'FM$999,999,990.00'), coalesce(b.invoice_ref, 'Bill #' || b.number), '/bills/' || b.id);
  end if;
  return v_amount;
end $$;

-- Holdback held on a PO: withheld on approved/paid bills minus what was released
create or replace function public.po_holdback(p_po uuid)
returns table (withheld numeric, released numeric, balance numeric)
language sql stable security definer set search_path = '' as $$
  with w as (
    select coalesce(sum(public.bill_holdback(b.id)) filter (where not b.is_holdback_release), 0) withheld,
           coalesce(sum(public.bill_subtotal(b.id)) filter (where b.is_holdback_release), 0) released
    from public.bills b where b.po_id = p_po and b.status in ('approved', 'paid') and b.deleted_at is null and public.can_see_po(p_po)
  ) select withheld, released, withheld - released from w;
$$;

-- Release holdback: a bill for the balance, split across the PO's cost codes
create or replace function public.release_holdback(p_po uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.purchase_orders; v_bal numeric; v_bill uuid;
begin
  select * into p from public.purchase_orders where id = p_po;
  if p.id is null or not private.bill_internal(p.job_id, p.org_id, 'add') then raise exception 'Not allowed' using errcode = '42501'; end if;
  select balance into v_bal from public.po_holdback(p_po);
  if coalesce(v_bal, 0) <= 0 then raise exception 'No holdback to release' using errcode = '22023'; end if;
  insert into public.bills (org_id, job_id, po_id, number, title, holdback_pct, is_holdback_release, lien_waiver_required, status)
  values (p.org_id, p.job_id, p_po, 0, 'Holdback release: ' || p.title, 0, true, true, 'draft') returning id into v_bill;
  insert into public.bill_items (bill_id, cost_code_id, cost_type, title, amount, sort)
  select v_bill, x.cost_code_id, x.cost_type, 'Holdback release', round(sum(x.hb), 2), 1 from (
    select bi.cost_code_id, bi.cost_type, bi.amount * b.holdback_pct / 100 hb
    from public.bill_items bi join public.bills b on b.id = bi.bill_id
    where b.po_id = p_po and b.status in ('approved', 'paid') and not b.is_holdback_release and b.deleted_at is null) x
  group by x.cost_code_id, x.cost_type;
  -- previous partial releases are rare; scale to the balance if needed
  update public.bill_items set amount = round(amount * v_bal / nullif((select sum(amount) from public.bill_items where bill_id = v_bill), 0), 2) where bill_id = v_bill;
  return v_bill;
end $$;

-- ---------------------------------------------------------------------
-- Budget: original + approved change orders vs committed (POs) vs actual (bills)
-- ---------------------------------------------------------------------
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
  a as (
    select i.cost_code_id, i.cost_type, sum(i.amount) amt, sum(i.amount) filter (where x.status = 'paid') pd
    from public.bill_items i join public.bills x on x.id = i.bill_id
    where x.job_id = p_job and x.status in ('approved', 'paid') and x.deleted_at is null group by 1, 2),
  k as (select cost_code_id, cost_type from b union select cost_code_id, cost_type from c union select cost_code_id, cost_type from a)
  select k.cost_code_id, k.cost_type, coalesce(b.oc, 0), coalesce(b.op, 0), coalesce(b.cc, 0), coalesce(b.cp, 0),
         coalesce(c.amt, 0), coalesce(a.amt, 0), coalesce(a.pd, 0)
  from k left join b on b.cost_code_id is not distinct from k.cost_code_id and b.cost_type = k.cost_type
         left join c on c.cost_code_id is not distinct from k.cost_code_id and c.cost_type = k.cost_type
         left join a on a.cost_code_id is not distinct from k.cost_code_id and a.cost_type = k.cost_type
  where (select ok from auth_ok);
$$;

do $$ declare f text; begin
  foreach f in array array['release_bid_package(uuid, timestamptz)', 'submit_bid(uuid, jsonb, text)', 'decline_bid(uuid, text)', 'award_bid(uuid)',
    'can_see_po(uuid)', 'po_total(uuid)', 'release_po(uuid)', 'decide_po(uuid, text, text, text, text)', 'set_po_work_status(uuid, public.work_status)',
    'bill_subtotal(uuid)', 'bill_holdback(uuid)', 'can_see_bill(uuid)', 'set_bill_status(uuid, text, text)', 'pay_bill(uuid, date, text, text)',
    'po_holdback(uuid)', 'release_holdback(uuid)', 'job_budget(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

insert into public.app_notification_types (key, grp, module, label, sort) values
  ('bid.invited', 'Financial', 'Bids', 'Invited to bid', 50),
  ('bid.submitted', 'Financial', 'Bids', 'Bid submitted', 51),
  ('bid.awarded', 'Financial', 'Bids', 'Bid awarded', 52),
  ('po.released', 'Financial', 'Purchase orders', 'Purchase order sent to you', 53),
  ('po.decided', 'Financial', 'Purchase orders', 'Purchase order accepted, declined or complete', 54),
  ('bill.submitted', 'Financial', 'Bills', 'Sub submitted a bill', 55),
  ('bill.updated', 'Financial', 'Bills', 'Bill approved, rejected or paid', 56);

create or replace function private.ntf_bill_submitted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.submitted_by_sub then
    perform private.notify(coalesce((select array_agg(user_id) from public.job_managers where job_id = new.job_id), (select array[created_by] from public.jobs where id = new.job_id)),
      new.org_id, new.job_id, 'bill.submitted', 'New bill from ' || (select name from public.organizations where id = new.sub_org_id), new.title, '/bills/' || new.id);
  end if;
  return null;
end $$;
create trigger bills_ntf after insert on public.bills for each row execute function private.ntf_bill_submitted();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.bid_packages enable row level security;
alter table public.bid_package_items enable row level security;
alter table public.bid_requests enable row level security;
alter table public.bid_request_prices enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.po_items enable row level security;
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;

create policy bidpkg_select on public.bid_packages for select to authenticated
  using ((private.can_module(job_id, 'bids', 'view') and private.has_perm(org_id, 'bids', 'cost')) or private.bid_sub_request(id) is not null);
create policy bidpkg_insert on public.bid_packages for insert to authenticated
  with check (private.can_module(job_id, 'bids', 'add') and private.has_perm(org_id, 'bids', 'cost'));
create policy bidpkg_update on public.bid_packages for update to authenticated
  using (private.can_module(job_id, 'bids', 'edit') and status in ('draft', 'open')) with check (private.can_module(job_id, 'bids', 'edit'));

create policy biditems_select on public.bid_package_items for select to authenticated
  using (private.bid_internal(package_id, 'view') or private.bid_sub_request(package_id) is not null);
create policy biditems_write on public.bid_package_items for all to authenticated
  using (private.bid_internal(package_id, 'edit') and (private.bid_pkg(package_id)).status = 'draft')
  with check (private.bid_internal(package_id, 'edit') and (private.bid_pkg(package_id)).status = 'draft');

create policy bidreq_select on public.bid_requests for select to authenticated
  using (private.bid_internal(package_id, 'view') or private.bid_sub_request(package_id) = id);
create policy bidreq_insert on public.bid_requests for insert to authenticated
  with check (private.bid_internal(package_id, 'edit') and status = 'invited' and (private.bid_pkg(package_id)).status in ('draft', 'open')
              and exists (select 1 from public.builder_sub_links l where l.builder_org_id = (private.bid_pkg(package_id)).org_id and l.sub_org_id = bid_requests.sub_org_id and l.status = 'active'));
create policy bidreq_delete on public.bid_requests for delete to authenticated
  using (private.bid_internal(package_id, 'edit') and status = 'invited');

create policy bidprices_select on public.bid_request_prices for select to authenticated
  using (exists (select 1 from public.bid_requests r where r.id = request_id));   -- request RLS decides

create policy po_select on public.purchase_orders for select to authenticated using (private.po_visible(org_id, job_id, sub_org_id, status, deleted_at));
create policy po_insert on public.purchase_orders for insert to authenticated with check (private.po_internal(job_id, org_id, 'add'));
create policy po_update on public.purchase_orders for update to authenticated
  using (private.po_internal(job_id, org_id, 'edit') and status = 'draft') with check (private.po_internal(job_id, org_id, 'edit'));

create policy poitems_select on public.po_items for select to authenticated using (public.can_see_po(po_id));
create policy poitems_write on public.po_items for all to authenticated
  using (private.po_internal((private.po_row(po_id)).job_id, (private.po_row(po_id)).org_id, 'edit') and (private.po_row(po_id)).status = 'draft')
  with check (private.po_internal((private.po_row(po_id)).job_id, (private.po_row(po_id)).org_id, 'edit') and (private.po_row(po_id)).status = 'draft');

create policy bills_select on public.bills for select to authenticated using (private.bill_visible(org_id, job_id, sub_org_id, status, deleted_at));
create policy bills_insert on public.bills for insert to authenticated
  with check (private.bill_internal(job_id, org_id, 'add') or (po_id is not null and sub_org_id is not null and private.is_my_linked_sub(org_id, sub_org_id)));
create policy bills_update on public.bills for update to authenticated
  using ((private.bill_internal(job_id, org_id, 'edit') and status in ('draft', 'submitted'))
      or (submitted_by_sub and status = 'submitted' and private.is_my_linked_sub(org_id, sub_org_id)))
  with check (true);

create policy billitems_select on public.bill_items for select to authenticated using (public.can_see_bill(bill_id));
create policy billitems_write on public.bill_items for all to authenticated
  using ((private.bill_row(bill_id)).status in ('draft', 'submitted') and (
          private.bill_internal((private.bill_row(bill_id)).job_id, (private.bill_row(bill_id)).org_id, 'edit')
       or ((private.bill_row(bill_id)).submitted_by_sub and private.is_my_linked_sub((private.bill_row(bill_id)).org_id, (private.bill_row(bill_id)).sub_org_id))))
  with check ((private.bill_row(bill_id)).status in ('draft', 'submitted') and (
          private.bill_internal((private.bill_row(bill_id)).job_id, (private.bill_row(bill_id)).org_id, 'edit')
       or ((private.bill_row(bill_id)).submitted_by_sub and private.is_my_linked_sub((private.bill_row(bill_id)).org_id, (private.bill_row(bill_id)).sub_org_id))));

-- Budget lines follow the budget module's cost permission from here on
drop policy budget_select on public.budget_lines;
create policy budget_select on public.budget_lines for select to authenticated
  using ((private.can_module(job_id, 'budget', 'view') and private.has_perm(org_id, 'budget', 'cost'))
      or (private.can_module(job_id, 'estimates', 'view') and private.has_perm(org_id, 'estimates', 'cost')));

revoke all on public.bid_packages, public.bid_package_items, public.bid_requests, public.bid_request_prices,
  public.purchase_orders, public.po_items, public.bills, public.bill_items from anon;
