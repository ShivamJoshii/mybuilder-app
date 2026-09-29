-- =====================================================================
-- Company reports (need reports view + cost): work in progress,
-- receivables aging, payables aging. Job scope follows the caller's
-- job access.
-- =====================================================================
create or replace function private.reports_ok(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_perm(p_org, 'reports', 'view') and private.has_perm(p_org, 'reports', 'cost');
$$;
grant execute on function private.reports_ok(uuid) to authenticated;

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
              where b.job_id = j.id and b.status in ('approved', 'paid') and b.deleted_at is null), 0),
    coalesce((select sum(l.amount) from public.client_invoice_lines l join public.client_invoices ci on ci.id = l.invoice_id
              where ci.job_id = j.id and ci.status in ('released', 'paid') and ci.deleted_at is null), 0),
    coalesce((select sum(p.amount) from public.client_payments p join public.client_invoices ci on ci.id = p.invoice_id
              where ci.job_id = j.id and ci.deleted_at is null), 0)
  from public.jobs j
  where j.org_id = p_org and j.deleted_at is null and j.status in ('open', 'warranty', 'presale')
    and private.reports_ok(p_org) and private.is_job_internal(j.id)
  order by j.title;
$$;

create or replace function public.report_receivables(p_org uuid)
returns table (invoice_id uuid, job_id uuid, job_title text, number int, title text, invoice_date date, due_date date, balance numeric)
language sql stable security definer set search_path = '' as $$
  select ci.id, j.id, j.title, ci.number, ci.title, ci.invoice_date, ci.due_date, t.balance
  from public.client_invoices ci join public.jobs j on j.id = ci.job_id
  cross join lateral public.invoice_totals(ci.id) t
  where ci.org_id = p_org and ci.status = 'released' and ci.deleted_at is null and t.balance > 0
    and private.reports_ok(p_org) and private.is_job_internal(j.id)
  order by coalesce(ci.due_date, ci.invoice_date);
$$;

create or replace function public.report_payables(p_org uuid)
returns table (bill_id uuid, job_id uuid, job_title text, payee text, invoice_ref text, invoice_date date, due_date date, payable numeric, waiver_missing boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, j.id, j.title, coalesce(o.name, b.vendor_name), coalesce(b.invoice_ref, 'Bill #' || b.number), b.invoice_date, b.due_date,
         public.bill_subtotal(b.id) + b.tax_amount - public.bill_holdback(b.id), b.lien_waiver_required and b.lien_waiver_received_at is null
  from public.bills b join public.jobs j on j.id = b.job_id left join public.organizations o on o.id = b.sub_org_id
  where b.org_id = p_org and b.status = 'approved' and b.deleted_at is null
    and private.reports_ok(p_org) and private.is_job_internal(j.id)
  order by coalesce(b.due_date, b.invoice_date);
$$;

do $$ declare f text; begin
  foreach f in array array['report_wip(uuid)', 'report_receivables(uuid)', 'report_payables(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
