-- Client portal money views, driven by the existing portal settings:
--   job_price_summary → contract, approved changes, invoiced, paid, balance
--   budget            → budget vs actual by cost code (typical for open-book / cost-plus jobs)
--   purchase_orders   → the POs and bills behind the costs
-- Only the job's clients, only the sections the builder switched on.

create or replace function public.client_job_financials(p_job uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare out jsonb := '{}'::jsonb; v_base numeric; v_co numeric; v_inv numeric; v_paid numeric; v_on boolean;
begin
  if not private.is_job_client(p_job) then return null; end if;

  if private.client_setting(p_job, 'job_price_summary') = 'true'::jsonb then
    select coalesce(sum(original_price) filter (where source = 'estimate'), 0), coalesce(sum(original_price) filter (where source <> 'estimate'), 0)
      into v_base, v_co from public.budget_lines where job_id = p_job;
    if v_base = 0 then select coalesce(contract_price, 0) into v_base from public.job_private where job_id = p_job; end if;
    select coalesce(sum(l.amount + case when l.taxable then round(l.amount * i.tax_rate / 100, 2) else 0 end), 0) into v_inv
      from public.client_invoices i join public.client_invoice_lines l on l.invoice_id = i.id
      where i.job_id = p_job and i.status in ('released', 'paid') and i.deleted_at is null;
    select coalesce(sum(p.amount), 0) into v_paid
      from public.client_payments p join public.client_invoices i on i.id = p.invoice_id
      where i.job_id = p_job and i.deleted_at is null and i.status <> 'void';
    out := out || jsonb_build_object('summary', jsonb_build_object('contract', v_base, 'changes', v_co, 'revised', v_base + v_co,
                                                                   'invoiced', v_inv, 'paid', v_paid, 'balance', v_base + v_co - v_paid));
  end if;

  if private.client_setting(p_job, 'budget') = 'true'::jsonb then
    out := out || jsonb_build_object('budget', coalesce((
      with b as (select cost_code_id, sum(original_cost) budget from public.budget_lines where job_id = p_job group by 1),
      a as (
        select i.cost_code_id, sum(i.amount) actual from public.bill_items i join public.bills x on x.id = i.bill_id
        where x.job_id = p_job and x.status in ('approved', 'paid') and x.deleted_at is null group by 1
        union all
        select s.cost_code_id, sum(round(public.shift_hours(s) * coalesce(s.hourly_cost, 0), 2)) from public.time_shifts s
        where s.job_id = p_job and s.status = 'approved' group by 1),
      k as (select cost_code_id from b union select cost_code_id from a)
      select jsonb_agg(jsonb_build_object('code', c.code, 'title', coalesce(c.title, 'Uncoded'),
               'budget', coalesce((select budget from b where b.cost_code_id is not distinct from k.cost_code_id), 0),
               'actual', coalesce((select sum(actual) from a where a.cost_code_id is not distinct from k.cost_code_id), 0)) order by c.code nulls last)
      from k left join public.cost_codes c on c.id = k.cost_code_id), '[]'::jsonb));
  end if;

  if private.client_setting(p_job, 'purchase_orders') = 'true'::jsonb then
    out := out || jsonb_build_object('costs', coalesce((
      select jsonb_agg(r order by r ->> 'date' desc) from (
        select jsonb_build_object('kind', 'Purchase order', 'ref', 'PO #' || p.number, 'title', p.title,
                                  'vendor', coalesce(o.name, p.vendor_name), 'date', coalesce(p.released_at::date, p.created_at::date),
                                  'amount', (select coalesce(sum(round(i.quantity * i.unit_cost, 2)), 0) from public.po_items i where i.po_id = p.id),
                                  'status', p.status) r
        from public.purchase_orders p left join public.organizations o on o.id = p.sub_org_id
        where p.job_id = p_job and p.status in ('released', 'accepted') and p.deleted_at is null
        union all
        select jsonb_build_object('kind', 'Bill', 'ref', coalesce(b.invoice_ref, 'Bill #' || b.number), 'title', b.title,
                                  'vendor', coalesce(o.name, b.vendor_name), 'date', b.invoice_date,
                                  'amount', (select coalesce(sum(i.amount), 0) from public.bill_items i where i.bill_id = b.id) + b.tax_amount,
                                  'status', b.status)
        from public.bills b left join public.organizations o on o.id = b.sub_org_id
        where b.job_id = p_job and b.status in ('approved', 'paid') and b.deleted_at is null) q), '[]'::jsonb));
  end if;
  return out;
end $$;
grant execute on function public.client_job_financials(uuid) to authenticated;
