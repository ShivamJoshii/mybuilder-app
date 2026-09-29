-- Create a bill with its lines in one transaction (caller's RLS applies)
create or replace function public.create_bill(p_bill jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.bills (org_id, job_id, po_id, sub_org_id, vendor_name, number, invoice_ref, title, invoice_date, due_date, tax_amount, holdback_pct, lien_waiver_required, status)
  select j.org_id, j.id, (p_bill->>'po_id')::uuid, (p_bill->>'sub_org_id')::uuid, nullif(p_bill->>'vendor_name', ''), 0, nullif(p_bill->>'invoice_ref', ''),
         p_bill->>'title', coalesce((p_bill->>'invoice_date')::date, current_date), (p_bill->>'due_date')::date, coalesce((p_bill->>'tax_amount')::numeric, 0),
         coalesce((p_bill->>'holdback_pct')::numeric, 0), coalesce((p_bill->>'lien_waiver_required')::boolean, false), 'draft'
  from public.jobs j where j.id = (p_bill->>'job_id')::uuid
  returning id into v_id;
  if v_id is null then raise exception 'Job not found' using errcode = 'P0002'; end if;
  insert into public.bill_items (bill_id, po_item_id, cost_code_id, cost_type, title, amount, sort)
  select v_id, x.po_item_id, coalesce(x.cost_code_id, pi.cost_code_id), coalesce(x.cost_type::public.cost_type, pi.cost_type, 'subcontractor'), coalesce(nullif(x.title, ''), pi.title), x.amount, coalesce(x.sort, 0)
  from jsonb_to_recordset(p_items) as x(po_item_id uuid, cost_code_id uuid, cost_type text, title text, amount numeric, sort int)
  left join public.po_items pi on pi.id = x.po_item_id
  where x.amount <> 0;
  if not exists (select 1 from public.bill_items where bill_id = v_id) then raise exception 'Enter an amount on at least one line' using errcode = '23514'; end if;
  return v_id;
end $$;
revoke execute on function public.create_bill(jsonb, jsonb) from public, anon;
grant execute on function public.create_bill(jsonb, jsonb) to authenticated;
