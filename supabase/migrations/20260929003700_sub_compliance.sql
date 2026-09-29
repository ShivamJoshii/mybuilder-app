-- Sub/vendor compliance: WCB clearance, liability insurance and other certificates per builder link,
-- with expiry tracking, builder rules, and an optional hard stop on paying non-compliant subs.

alter table public.organizations
  add column compliance_required text[] not null default '{wcb_clearance,liability_insurance}',
  add column compliance_blocks_payment boolean not null default false;

create table public.sub_certificates (
  id             uuid primary key default gen_random_uuid(),
  builder_org_id uuid not null references public.organizations (id) on delete cascade,
  sub_org_id     uuid not null references public.organizations (id) on delete cascade,
  kind           text not null check (kind in ('wcb_clearance', 'liability_insurance', 'auto_insurance', 'business_licence', 'safety_cor', 'other')),
  label          text check (length(label) <= 120),
  number         text check (length(number) <= 120),
  provider       text check (length(provider) <= 200),
  coverage       numeric(14, 2) check (coverage >= 0),
  effective_on   date,
  expires_on     date,
  file_id        uuid references public.files (id) on delete set null,
  notes          text check (length(notes) <= 2000),
  verified_at    timestamptz,                       -- the builder checked the document; only verified certificates count
  verified_by    uuid references auth.users (id) on delete set null,
  created_by     uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (expires_on is null or effective_on is null or expires_on >= effective_on)
);
create index sub_certificates_link_idx on public.sub_certificates (builder_org_id, sub_org_id);
create index sub_certificates_file_idx on public.sub_certificates (file_id);
alter table public.sub_certificates enable row level security;

create or replace function private.cert_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_builder_side boolean := private.is_member(new.builder_org_id) and private.has_perm(new.builder_org_id, 'subs_vendors', 'edit');
begin
  if tg_op = 'UPDATE' then
    new.builder_org_id := old.builder_org_id; new.sub_org_id := old.sub_org_id; new.created_by := old.created_by; new.created_at := old.created_at;
    if not v_builder_side then
      -- a sub may correct its own certificate, but that sends it back for review
      new.verified_at := null; new.verified_by := null;
    elsif new.verified_at is distinct from old.verified_at then
      new.verified_by := case when new.verified_at is null then null else auth.uid() end;
      new.verified_at := case when new.verified_at is null then null else now() end;
    end if;
  else
    new.created_by := auth.uid();
    -- certificates the builder enters are verified; a sub's wait for review
    new.verified_at := case when v_builder_side then now() end;
    new.verified_by := case when v_builder_side then auth.uid() end;
  end if;
  new.updated_at := now();
  if not exists (select 1 from public.builder_sub_links where builder_org_id = new.builder_org_id and sub_org_id = new.sub_org_id) then
    raise exception 'That company is not linked to this builder' using errcode = '23514';
  end if;
  -- the document must be in the caller's own company's compliance folder, and visible to them
  if new.file_id is not null and new.file_id is distinct from (case when tg_op = 'UPDATE' then old.file_id end) and not exists (
       select 1 from public.files f join public.file_folders d on d.id = f.folder_id
       where f.id = new.file_id and d.system_key = 'compliance' and d.org_id in (new.builder_org_id, new.sub_org_id)
         and private.is_member(d.org_id) and private.can_see_file(f.id)) then
    raise exception 'Upload the certificate first' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger sub_certificates_fill before insert or update on public.sub_certificates
  for each row execute function private.cert_fill();

create or replace function private.cert_can_view(p_builder uuid, p_sub uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (private.is_member(p_builder) and private.has_perm(p_builder, 'subs_vendors', 'view'))
      or (private.is_member(p_sub) and exists (select 1 from public.builder_sub_links l
            where l.builder_org_id = p_builder and l.sub_org_id = p_sub and l.status = 'active'));
$$;
create or replace function private.cert_can_edit(p_builder uuid, p_sub uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (private.is_member(p_builder) and private.has_perm(p_builder, 'subs_vendors', 'edit'))
      or (private.is_member(p_sub) and exists (select 1 from public.builder_sub_links l
            where l.builder_org_id = p_builder and l.sub_org_id = p_sub and l.status = 'active'));
$$;

create policy certs_select on public.sub_certificates for select to authenticated using (private.cert_can_view(builder_org_id, sub_org_id));
create policy certs_insert on public.sub_certificates for insert to authenticated with check (private.cert_can_edit(builder_org_id, sub_org_id));
create policy certs_update on public.sub_certificates for update to authenticated
  using (private.cert_can_edit(builder_org_id, sub_org_id)) with check (private.cert_can_edit(builder_org_id, sub_org_id));
create policy certs_delete on public.sub_certificates for delete to authenticated using (
  (private.is_member(builder_org_id) and private.has_perm(builder_org_id, 'subs_vendors', 'edit'))
  or (verified_at is null and private.cert_can_edit(builder_org_id, sub_org_id)));
grant select, insert, update, delete on public.sub_certificates to authenticated;

-- Each company gets a private "compliance" folder for certificate documents (created on first use)
create or replace function public.compliance_folder(p_org uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not private.is_member(p_org) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select id into v from public.file_folders where org_id = p_org and job_id is null and kind = 'documents' and system_key = 'compliance';
  if v is null then
    insert into public.file_folders (org_id, job_id, kind, name, system_key) values (p_org, null, 'documents', 'Compliance', 'compliance')
      on conflict do nothing returning id into v;
    if v is null then
      select id into v from public.file_folders where org_id = p_org and job_id is null and kind = 'documents' and system_key = 'compliance';
    end if;
  end if;
  return v;
end $$;
grant execute on function public.compliance_folder(uuid) to authenticated;

create or replace function private.can_upload_to(p_folder uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.file_folders f where f.id = p_folder and f.deleted_at is null and (
      (f.system_key = 'compliance' and private.is_member(f.org_id))
      or (f.job_id is null and coalesce(f.system_key, '') <> 'compliance' and private.has_perm(f.org_id, 'files', 'add'))
      or (f.job_id is not null and private.can_module(f.job_id, 'files', 'add'))
      or (f.job_id is not null and private.is_job_sub(f.job_id) and f.system_key in ('sub_uploads', 'attachments'))
      or (f.job_id is not null and private.is_job_client(f.job_id) and f.system_key = 'attachments')));
$$;

-- Certificate documents are visible to whoever can see the certificate
create or replace function private.cert_file_visible(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sub_certificates c where c.file_id = p_file and private.cert_can_view(c.builder_org_id, c.sub_org_id));
$$;

alter policy files_select on public.files using (
  private.file_visible(org_id, job_id, share_subs, share_clients, uploaded_by, uploader_org, deleted_at)
  or (deleted_at is null and (private.bid_file_visible(id) or private.cert_file_visible(id))));

create or replace function private.can_see_file(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.file_visible(f.org_id, f.job_id, f.share_subs, f.share_clients, f.uploaded_by, f.uploader_org, f.deleted_at)
                          or (f.deleted_at is null and (private.bid_file_visible(f.id) or private.cert_file_visible(f.id)))
                   from public.files f where f.id = p_file), false);
$$;

create or replace function private.cert_label(p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case p_kind when 'wcb_clearance' then 'WCB clearance' when 'liability_insurance' then 'Liability insurance'
    when 'auto_insurance' then 'Auto insurance' when 'business_licence' then 'Business licence' when 'safety_cor' then 'COR safety certificate' else 'Certificate' end;
$$;

-- Compliance status of a sub for a builder: ok / expiring (within 30 days) / expired / missing
create or replace function private.sub_compliance_raw(p_builder uuid, p_sub uuid)
returns table (status text, detail text)
language sql stable security definer set search_path = '' as $$
  with req as (
    select unnest(o.compliance_required) kind from public.organizations o where o.id = p_builder
  ), best as (
    select r.kind,
           (select max(coalesce(c.expires_on, 'infinity'::date)) from public.sub_certificates c
             where c.builder_org_id = p_builder and c.sub_org_id = p_sub and c.kind = r.kind and c.verified_at is not null
               and (c.effective_on is null or c.effective_on <= current_date)) exp,
           exists (select 1 from public.sub_certificates c where c.builder_org_id = p_builder and c.sub_org_id = p_sub and c.kind = r.kind
                     and c.verified_at is null and (c.expires_on is null or c.expires_on >= current_date)) unreviewed,
           exists (select 1 from public.sub_certificates c where c.builder_org_id = p_builder and c.sub_org_id = p_sub and c.kind = r.kind) had
    from req r
  ), graded as (
    -- 0 ok, 1 expiring, 2 waiting for the builder's review, 3 expired, 4 missing
    select kind, exp, case
      when exp is not null and exp >= current_date then case when exp <= current_date + 30 then 1 else 0 end
      when unreviewed then 2 when had then 3 else 4 end g
    from best
  )
  select case coalesce(max(g), 0) when 0 then 'ok' when 1 then 'expiring' when 2 then 'review' when 3 then 'expired' else 'missing' end,
         coalesce(string_agg(
           case g when 4 then private.cert_label(kind) || ' missing'
                  when 3 then private.cert_label(kind) || ' expired'
                  when 2 then private.cert_label(kind) || ' waiting for review'
                  when 1 then private.cert_label(kind) || ' expires ' || to_char(exp, 'Mon DD') end, '; ' order by g desc)
           filter (where g > 0), '')
  from graded;
$$;

create or replace function public.sub_compliance(p_builder uuid, p_sub uuid)
returns table (status text, detail text)
language sql stable security definer set search_path = '' as $$
  select r.status, r.detail from private.sub_compliance_raw(p_builder, p_sub) r
  where private.cert_can_view(p_builder, p_sub) or private.is_member(p_builder);
$$;


-- Payments stop for non-compliant subs when the builder turns the rule on
create or replace function public.pay_bill(p_bill uuid, p_paid_on date, p_method text, p_ref text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare b public.bills; v_amount numeric; v_status text; v_detail text;
begin
  select * into b from public.bills where id = p_bill for update;
  if b.id is null or not private.bill_internal(b.job_id, b.org_id, 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if not private.has_action(b.org_id, 'bills.mark_paid') then raise exception 'You don''t have permission to pay bills' using errcode = '42501'; end if;
  if b.status <> 'approved' then raise exception 'Approve the bill before paying it' using errcode = '22023'; end if;
  if b.lien_waiver_required and b.lien_waiver_received_at is null then raise exception 'A lien waiver is required before payment' using errcode = '22023'; end if;
  if b.sub_org_id is not null and (select compliance_blocks_payment from public.organizations where id = b.org_id) then
    select c.status, c.detail into v_status, v_detail from private.sub_compliance_raw(b.org_id, b.sub_org_id) c;
    if v_status in ('review', 'expired', 'missing') then
      raise exception 'This sub isn''t compliant: %', v_detail using errcode = '22023';
    end if;
  end if;
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

-- Only settings managers change the rules
create or replace function private.org_compliance_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.compliance_required is distinct from old.compliance_required or new.compliance_blocks_payment is distinct from old.compliance_blocks_payment)
     and not private.has_action(old.id, 'settings.manage') then
    new.compliance_required := old.compliance_required; new.compliance_blocks_payment := old.compliance_blocks_payment;
  end if;
  if exists (select 1 from unnest(new.compliance_required) k where k not in ('wcb_clearance', 'liability_insurance', 'auto_insurance', 'business_licence', 'safety_cor')) then
    raise exception 'Unknown certificate type' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger organizations_compliance_guard before update on public.organizations
  for each row execute function private.org_compliance_guard();

grant execute on all functions in schema private to authenticated;

-- Members see their own company's compliance folder (sub companies have no file permissions otherwise)
create or replace function private.folder_visible(p_org uuid, p_job uuid, p_subs boolean, p_clients boolean, p_system text, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and case
    when p_job is null then
      (p_system = 'compliance' and private.is_member(p_org))
      or (private.is_member(p_org) and private.has_perm(p_org, 'files', 'view'))
      or (p_subs and private.is_linked_sub_of(p_org))
      or (p_clients and private.is_client_of(p_org))
    else
      private.can_module(p_job, 'files', 'view')
      or (private.is_job_sub(p_job) and (p_subs or p_system = 'sub_uploads'))
      or (private.is_job_client(p_job) and p_clients)
  end;
$$;
