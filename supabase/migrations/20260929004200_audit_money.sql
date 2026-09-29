-- Audit trail covers money and compliance records too, and ignores no-op updates.

create or replace function private.audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id text; v_row jsonb;
begin
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then return null; end if;
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org := coalesce((v_row ->> 'org_id')::uuid, (v_row ->> 'builder_org_id')::uuid,
                    case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid end);
  v_id  := coalesce(v_row ->> 'id', v_row ->> 'job_id', v_row ->> 'role_id', '');
  if v_org is null and v_row ? 'job_id' then
    select j.org_id into v_org from public.jobs j where j.id = (v_row ->> 'job_id')::uuid;
  end if;
  insert into public.audit_log (org_id, actor_id, table_name, record_id, action, before, after)
  values (v_org, auth.uid(), tg_table_name, v_id, lower(tg_op),
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return null;
end $$;

create trigger audit_bills            after insert or update or delete on public.bills            for each row execute function private.audit();
create trigger audit_purchase_orders  after insert or update or delete on public.purchase_orders  for each row execute function private.audit();
create trigger audit_client_invoices  after insert or update or delete on public.client_invoices  for each row execute function private.audit();
create trigger audit_client_payments  after insert or update or delete on public.client_payments  for each row execute function private.audit();
create trigger audit_change_orders    after insert or update or delete on public.change_orders    for each row execute function private.audit();
create trigger audit_selections       after insert or update or delete on public.selections       for each row execute function private.audit();
create trigger audit_time_shifts      after insert or update or delete on public.time_shifts      for each row execute function private.audit();
create trigger audit_sub_certificates after insert or update or delete on public.sub_certificates for each row execute function private.audit();
create trigger audit_proposals        after insert or update or delete on public.proposals        for each row execute function private.audit();
create trigger audit_organizations    after update on public.organizations for each row execute function private.audit();
