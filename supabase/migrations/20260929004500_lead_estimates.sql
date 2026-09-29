-- Estimate a lead before it is sold: the lead gets a Presale job (its estimate and proposal live there).
-- Converting the lead later reuses that job instead of creating a second one.

alter table public.leads add column job_id uuid references public.jobs (id) on delete set null;

create or replace function public.start_lead_job(p_lead uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.leads; v_job uuid;
begin
  select * into l from public.leads where id = p_lead and deleted_at is null for update;
  if l.id is null or not private.can_see_lead(p_lead) then raise exception 'Lead not found' using errcode = 'P0002'; end if;
  if not private.has_perm(l.org_id, 'leads', 'edit') or not private.has_perm(l.org_id, 'jobs', 'add') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if coalesce(l.converted_job_id, l.job_id) is not null then return coalesce(l.converted_job_id, l.job_id); end if;
  insert into public.jobs (org_id, title, status, street, city, province, postal_code)
  values (l.org_id, l.title, 'presale', l.site_street, l.site_city, coalesce(l.site_province, (select province from public.organizations where id = l.org_id), 'AB'), l.site_postal)
  returning id into v_job;
  if l.contact_first <> '' or l.contact_email is not null then
    insert into public.job_clients (job_id, first_name, last_name, email, phone, is_primary)
    values (v_job, l.contact_first, l.contact_last, l.contact_email, l.contact_phone, true);
  end if;
  update public.leads set job_id = v_job where id = p_lead;
  return v_job;
end $$;
grant execute on function public.start_lead_job(uuid) to authenticated;

create or replace function public.convert_lead_to_job(p_lead uuid, p_title text, p_contract public.contract_type default 'fixed_price', p_amount numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.leads; v_job uuid; v_sold uuid;
begin
  select * into l from public.leads where id = p_lead and deleted_at is null;
  if l.id is null or not private.can_see_lead(p_lead) then raise exception 'Lead not found' using errcode = 'P0002'; end if;
  -- leads.convert is the grant to create the job (sales roles have it without general jobs.add)
  if not private.has_action(l.org_id, 'leads.convert') then raise exception 'Not allowed to convert leads' using errcode = '42501'; end if;
  if l.converted_job_id is not null then raise exception 'Already converted' using errcode = '23505'; end if;
  if l.job_id is not null and exists (select 1 from public.jobs where id = l.job_id and deleted_at is null) then
    -- the lead was estimated on a Presale job already: that job becomes the sold job
    v_job := l.job_id;
    update public.jobs set title = coalesce(nullif(trim(p_title), ''), title), contract_type = p_contract where id = v_job;
  else
    insert into public.jobs (org_id, title, status, contract_type, street, city, province, postal_code)
    values (l.org_id, coalesce(nullif(trim(p_title), ''), l.title), 'presale', p_contract, l.site_street, l.site_city, coalesce(l.site_province, 'AB'), l.site_postal)
    returning id into v_job;
    if l.contact_first <> '' or l.contact_email is not null then
      insert into public.job_clients (job_id, first_name, last_name, email, phone, is_primary)
      values (v_job, l.contact_first, l.contact_last, l.contact_email, l.contact_phone, true);
    end if;
  end if;
  if p_amount is not null then update public.job_private set contract_price = p_amount where job_id = v_job; end if;
  select id into v_sold from public.lead_statuses where org_id = l.org_id and category = 'won' order by sort limit 1;
  update public.leads set status_id = v_sold, converted_job_id = v_job, sold_amount = coalesce(p_amount, sold_amount) where id = p_lead;
  return v_job;
end $$;
