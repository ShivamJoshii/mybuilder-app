-- Atomic line saves for bid packages and purchase orders (caller's RLS applies)
create or replace function public.save_bid_items(p_package uuid, p_items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if (select status from public.bid_packages where id = p_package) is distinct from 'draft' then
    raise exception 'Lines are locked once the bid is released' using errcode = '55000';
  end if;
  delete from public.bid_package_items where package_id = p_package
    and id not in (select (v->>'id')::uuid from jsonb_array_elements(coalesce(p_items, '[]')) v);
  insert into public.bid_package_items as i (id, package_id, cost_code_id, cost_type, title, description, quantity, unit, sort)
  select x.id, p_package, x.cost_code_id, coalesce(x.cost_type, 'subcontractor')::public.cost_type, x.title, nullif(x.description, ''),
         coalesce(x.quantity, 1), coalesce(nullif(x.unit, ''), 'ls'), x.sort
  from jsonb_to_recordset(coalesce(p_items, '[]')) as x(id uuid, cost_code_id uuid, cost_type text, title text, description text, quantity numeric, unit text, sort int)
  on conflict (id) do update set cost_code_id = excluded.cost_code_id, cost_type = excluded.cost_type, title = excluded.title,
    description = excluded.description, quantity = excluded.quantity, unit = excluded.unit, sort = excluded.sort
    where i.package_id = p_package;
end $$;

create or replace function public.save_po_items(p_po uuid, p_items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if (select status from public.purchase_orders where id = p_po) is distinct from 'draft' then
    raise exception 'Lines are locked once the purchase order is released' using errcode = '55000';
  end if;
  delete from public.po_items where po_id = p_po
    and id not in (select (v->>'id')::uuid from jsonb_array_elements(coalesce(p_items, '[]')) v);
  insert into public.po_items as i (id, po_id, cost_code_id, cost_type, title, description, quantity, unit, unit_cost, sort)
  select x.id, p_po, x.cost_code_id, coalesce(x.cost_type, 'subcontractor')::public.cost_type, x.title, nullif(x.description, ''),
         coalesce(x.quantity, 1), coalesce(nullif(x.unit, ''), 'ls'), coalesce(x.unit_cost, 0), x.sort
  from jsonb_to_recordset(coalesce(p_items, '[]')) as x(id uuid, cost_code_id uuid, cost_type text, title text, description text, quantity numeric, unit text, unit_cost numeric, sort int)
  on conflict (id) do update set cost_code_id = excluded.cost_code_id, cost_type = excluded.cost_type, title = excluded.title,
    description = excluded.description, quantity = excluded.quantity, unit = excluded.unit, unit_cost = excluded.unit_cost, sort = excluded.sort
    where i.po_id = p_po;
end $$;

-- Billed to date per PO line (for bill entry and the PO page)
create or replace function public.po_line_billing(p_po uuid)
returns table (po_item_id uuid, line_total numeric, billed numeric)
language sql stable security definer set search_path = '' as $$
  select i.id, round(i.quantity * i.unit_cost, 2),
         coalesce((select sum(bi.amount) from public.bill_items bi join public.bills b on b.id = bi.bill_id
                   where bi.po_item_id = i.id and b.status <> 'rejected' and b.deleted_at is null and not b.is_holdback_release), 0)
  from public.po_items i where i.po_id = p_po and public.can_see_po(p_po);
$$;

do $$ declare f text; begin
  foreach f in array array['save_bid_items(uuid, jsonb)', 'save_po_items(uuid, jsonb)', 'po_line_billing(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Bid requests for the caller's sub companies, with builder and job names
-- (subs can't read presale jobs directly; bidders still need to know what the job is)
create or replace function public.my_bid_requests()
returns table (request_id uuid, package_id uuid, title text, due_at timestamptz, package_status public.bid_package_status,
               status public.bid_request_status, total numeric, builder_name text, job_title text, job_city text)
language sql stable security definer set search_path = '' as $$
  select r.id, p.id, p.title, p.due_at, p.status, r.status, r.total, o.name, j.title, j.city
  from public.bid_requests r
  join public.bid_packages p on p.id = r.package_id and p.status <> 'draft' and p.deleted_at is null
  join public.organizations o on o.id = p.org_id
  join public.jobs j on j.id = p.job_id
  where private.is_my_linked_sub(p.org_id, r.sub_org_id)
  order by p.released_at desc nulls last;
$$;

create or replace function public.bid_job_info(p_package uuid)
returns table (builder_name text, job_title text, street text, city text, province text)
language sql stable security definer set search_path = '' as $$
  select o.name, j.title, j.street, j.city, j.province
  from public.bid_packages p join public.organizations o on o.id = p.org_id join public.jobs j on j.id = p.job_id
  where p.id = p_package and (private.bid_internal(p.id, 'view') or private.bid_sub_request(p.id) is not null);
$$;
revoke execute on function public.my_bid_requests(), public.bid_job_info(uuid) from public, anon;
grant execute on function public.my_bid_requests(), public.bid_job_info(uuid) to authenticated;
