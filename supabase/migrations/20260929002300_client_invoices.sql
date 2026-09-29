-- =====================================================================
-- Client (owner) invoices: draws by % of contract, fixed amounts, and
-- approved change orders; GST/HST; optional owner holdback; payments
-- recorded by hand (online payments come later).
-- =====================================================================

create type public.invoice_status as enum ('draft', 'released', 'paid', 'void');

create table public.client_invoices (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  job_id        uuid not null references public.jobs (id) on delete cascade,
  number        int not null,
  title         text not null check (length(trim(title)) between 1 and 200),
  description   text check (length(description) <= 8000),
  invoice_date  date not null default current_date,
  due_date      date,
  status        public.invoice_status not null default 'draft',
  tax_rate      numeric(6,3) not null default 5,
  tax_label     text not null default 'GST',
  holdback_pct  numeric(5,2) not null default 0 check (holdback_pct between 0 and 100),
  released_at   timestamptz,
  voided_at     timestamptz,
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (job_id, number)
);
create index client_invoices_job on public.client_invoices (job_id) where deleted_at is null;

create table public.client_invoice_lines (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.client_invoices (id) on delete cascade,
  kind             text not null default 'amount' check (kind in ('amount', 'percent', 'change_order')),
  change_order_id  uuid references public.change_orders (id) on delete set null,
  title            text not null check (length(trim(title)) between 1 and 200),
  percent          numeric(7,3),
  amount           numeric(14,2) not null,
  taxable          boolean not null default true,
  sort             int not null default 0
);
create index client_invoice_lines_inv on public.client_invoice_lines (invoice_id);

create table public.client_payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.client_invoices (id) on delete cascade,
  paid_on     date not null,
  amount      numeric(14,2) not null check (amount <> 0),
  method      text not null default 'eft' check (method in ('eft', 'cheque', 'credit_card', 'cash', 'other')),
  reference   text check (length(reference) <= 80),
  note        text check (length(note) <= 500),
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now()
);
create index client_payments_inv on public.client_payments (invoice_id);

create or replace function private.invoice_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  if tg_op = 'INSERT' then
    select org_id into new.org_id from public.jobs where id = new.job_id;
    perform pg_advisory_xact_lock(hashtext('inv:' || new.job_id::text));
    select coalesce(max(number), 0) + 1 into new.number from public.client_invoices where job_id = new.job_id;
    new.created_by := auth.uid(); new.status := 'draft'; new.released_at := null; new.voided_at := null;
    select tax_rate, tax_label into e from public.estimates where job_id = new.job_id;
    if found then new.tax_rate := e.tax_rate; new.tax_label := e.tax_label; end if;
  else
    new.org_id := old.org_id; new.job_id := old.job_id; new.number := old.number; new.created_by := old.created_by;
    if current_setting('app.invoice_status', true) is distinct from 'on' then
      new.status := old.status; new.released_at := old.released_at; new.voided_at := old.voided_at;
    end if;
  end if;
  return new;
end $$;
create trigger client_invoices_fill before insert or update on public.client_invoices for each row execute function private.invoice_fill();

create or replace function private.invoice_row(p uuid)
returns public.client_invoices language sql stable security definer set search_path = '' as $$ select * from public.client_invoices where id = p $$;
create or replace function private.invoice_visible(p_org uuid, p_job uuid, p_status public.invoice_status, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_module(p_job, 'invoices', 'view')
      or (p_deleted is null and p_status in ('released', 'paid') and private.is_job_client(p_job)
          and coalesce(private.client_setting(p_job, 'invoices'), 'true'::jsonb) <> 'false'::jsonb);
$$;
create or replace function public.can_see_invoice(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.client_invoices i where i.id = p and private.invoice_visible(i.org_id, i.job_id, i.status, i.deleted_at));
$$;
grant execute on function private.invoice_row(uuid), private.invoice_visible(uuid, uuid, public.invoice_status, timestamptz) to authenticated;

-- Totals: subtotal, tax, owner holdback, total due, paid, balance
create or replace function public.invoice_totals(p uuid)
returns table (subtotal numeric, tax numeric, holdback numeric, total numeric, paid numeric, balance numeric)
language sql stable security definer set search_path = '' as $$
  with l as (select coalesce(sum(amount), 0) sub, coalesce(sum(amount) filter (where taxable), 0) tx from public.client_invoice_lines where invoice_id = p),
       i as (select * from public.client_invoices where id = p and public.can_see_invoice(p)),
       pay as (select coalesce(sum(amount), 0) paid from public.client_payments where invoice_id = p)
  select l.sub, round(l.tx * i.tax_rate / 100, 2), round(l.sub * i.holdback_pct / 100, 2),
         l.sub + round(l.tx * i.tax_rate / 100, 2) - round(l.sub * i.holdback_pct / 100, 2), pay.paid,
         l.sub + round(l.tx * i.tax_rate / 100, 2) - round(l.sub * i.holdback_pct / 100, 2) - pay.paid
  from l, i, pay;
$$;

-- Contract price for draws: estimate budget + approved change orders (prices)
create or replace function public.job_contract(p_job uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(original_price), 0) from public.budget_lines where job_id = p_job and private.can_module(p_job, 'invoices', 'view');
$$;

-- Lines lock once released
create or replace function private.invoice_line_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select status from public.client_invoices where id = coalesce(new.invoice_id, old.invoice_id)) <> 'draft' then
    raise exception 'Released invoices are locked. Void it and create a new one.' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;
create trigger client_invoice_lines_guard before insert or update or delete on public.client_invoice_lines for each row execute function private.invoice_line_guard();

create or replace function public.save_invoice_lines(p_invoice uuid, p_lines jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.client_invoice_lines where invoice_id = p_invoice;
  insert into public.client_invoice_lines (invoice_id, kind, change_order_id, title, percent, amount, taxable, sort)
  select p_invoice, coalesce(x.kind, 'amount'), x.change_order_id, x.title, x.percent, x.amount, coalesce(x.taxable, true), coalesce(x.sort, 0)
  from jsonb_to_recordset(coalesce(p_lines, '[]')) as x(kind text, change_order_id uuid, title text, percent numeric, amount numeric, taxable boolean, sort int);
end $$;

create or replace function public.release_invoice(p uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.client_invoices; t record;
begin
  select * into i from public.client_invoices where id = p for update;
  if i.id is null or not private.can_module(i.job_id, 'invoices', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if i.status <> 'draft' then raise exception 'Already released' using errcode = '22023'; end if;
  select * into t from public.invoice_totals(p);
  if coalesce(t.subtotal, 0) = 0 then raise exception 'Add at least one line' using errcode = '22023'; end if;
  perform set_config('app.invoice_status', 'on', true);
  update public.client_invoices set status = 'released', released_at = now() where id = p;
  perform set_config('app.invoice_status', 'off', true);
  if coalesce(private.client_setting(i.job_id, 'invoices'), 'true'::jsonb) <> 'false'::jsonb then
    perform private.notify((select coalesce(array_agg(user_id), '{}') from public.job_clients where job_id = i.job_id and user_id is not null),
      i.org_id, i.job_id, 'invoice.released', 'New invoice: ' || i.title, 'Amount due ' || to_char(t.total, 'FM$999,999,990.00'), '/invoices/' || i.id);
  end if;
end $$;

create or replace function public.void_invoice(p uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.client_invoices;
begin
  select * into i from public.client_invoices where id = p for update;
  if i.id is null or not private.can_module(i.job_id, 'invoices', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if i.status not in ('released', 'draft') then raise exception 'Only open invoices can be voided' using errcode = '22023'; end if;
  if exists (select 1 from public.client_payments where invoice_id = p) then raise exception 'Remove the payments first' using errcode = '22023'; end if;
  perform set_config('app.invoice_status', 'on', true);
  update public.client_invoices set status = 'void', voided_at = now() where id = p;
  perform set_config('app.invoice_status', 'off', true);
end $$;

create or replace function public.record_client_payment(p uuid, p_paid_on date, p_amount numeric, p_method text, p_ref text default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.client_invoices; v_bal numeric;
begin
  select * into i from public.client_invoices where id = p for update;
  if i.id is null or not private.can_module(i.job_id, 'invoices', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if i.status not in ('released', 'paid') then raise exception 'Release the invoice first' using errcode = '22023'; end if;
  insert into public.client_payments (invoice_id, paid_on, amount, method, reference, note) values (p, p_paid_on, p_amount, p_method, p_ref, p_note);
  select balance into v_bal from public.invoice_totals(p);
  perform set_config('app.invoice_status', 'on', true);
  update public.client_invoices set status = case when v_bal <= 0 then 'paid'::public.invoice_status else 'released'::public.invoice_status end where id = p;
  perform set_config('app.invoice_status', 'off', true);
end $$;

do $$ declare f text; begin
  foreach f in array array['can_see_invoice(uuid)', 'invoice_totals(uuid)', 'job_contract(uuid)', 'save_invoice_lines(uuid, jsonb)', 'release_invoice(uuid)',
    'void_invoice(uuid)', 'record_client_payment(uuid, date, numeric, text, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

insert into public.app_notification_types (key, grp, module, label, sort) values ('invoice.released', 'Financial', 'Invoices', 'New invoice', 60);

alter table public.client_invoices enable row level security;
alter table public.client_invoice_lines enable row level security;
alter table public.client_payments enable row level security;

create policy inv_select on public.client_invoices for select to authenticated using (private.invoice_visible(org_id, job_id, status, deleted_at));
create policy inv_insert on public.client_invoices for insert to authenticated with check (private.can_module(job_id, 'invoices', 'add'));
create policy inv_update on public.client_invoices for update to authenticated
  using (private.can_module(job_id, 'invoices', 'edit') and status = 'draft') with check (private.can_module(job_id, 'invoices', 'edit'));

create policy invlines_select on public.client_invoice_lines for select to authenticated using (public.can_see_invoice(invoice_id));
create policy invlines_write on public.client_invoice_lines for all to authenticated
  using (private.can_module((private.invoice_row(invoice_id)).job_id, 'invoices', 'edit'))
  with check (private.can_module((private.invoice_row(invoice_id)).job_id, 'invoices', 'edit'));

create policy invpay_select on public.client_payments for select to authenticated using (public.can_see_invoice(invoice_id));
create policy invpay_delete on public.client_payments for delete to authenticated using (private.can_module((private.invoice_row(invoice_id)).job_id, 'invoices', 'edit'));

revoke all on public.client_invoices, public.client_invoice_lines, public.client_payments from anon;

-- Removing a payment reopens a paid invoice
create or replace function private.payment_removed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.invoice_status', 'on', true);
  update public.client_invoices set status = 'released' where id = old.invoice_id and status = 'paid'
    and (select balance from public.invoice_totals(old.invoice_id)) > 0;
  perform set_config('app.invoice_status', 'off', true);
  return null;
end $$;
create trigger client_payments_removed after delete on public.client_payments for each row execute function private.payment_removed();
