-- Bid documents: plan sheets and attachments on a bid package are visible to invited bidders,
-- even when the bidder is not (yet) a sub on the job.

create table public.bid_package_sheets (
  package_id uuid not null references public.bid_packages (id) on delete cascade,
  sheet_id   uuid not null references public.plan_sheets (id) on delete cascade,
  primary key (package_id, sheet_id)
);
create index bid_package_sheets_sheet_idx on public.bid_package_sheets (sheet_id);
alter table public.bid_package_sheets enable row level security;

create or replace function private.check_bid_sheet()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select job_id from public.plan_sheets where id = new.sheet_id) is distinct from (private.bid_pkg(new.package_id)).job_id then
    raise exception 'That sheet is on another job' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger bid_package_sheets_check before insert or update on public.bid_package_sheets
  for each row execute function private.check_bid_sheet();

create policy bid_sheets_select on public.bid_package_sheets for select to authenticated
  using (private.bid_internal(package_id, 'view') or private.bid_sub_request(package_id) is not null);
create policy bid_sheets_insert on public.bid_package_sheets for insert to authenticated
  with check (private.bid_internal(package_id, 'edit') and (private.bid_pkg(package_id)).status in ('draft', 'open'));
create policy bid_sheets_delete on public.bid_package_sheets for delete to authenticated
  using (private.bid_internal(package_id, 'edit') and (private.bid_pkg(package_id)).status in ('draft', 'open'));
grant select, insert, delete on public.bid_package_sheets to authenticated;

-- A bidder on a released package can see its sheets
create or replace function private.bid_sheet_visible(p_sheet uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bid_package_sheets bs
                 where bs.sheet_id = p_sheet and private.bid_sub_request(bs.package_id) is not null);
$$;

create or replace function public.can_see_sheet(p_sheet uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plan_sheets s where s.id = p_sheet
                 and (private.plan_visible(s.job_id, s.share_subs, s.share_clients, s.deleted_at)
                      or (s.deleted_at is null and private.bid_sheet_visible(s.id))));
$$;

alter policy sheets_select on public.plan_sheets using (
  private.plan_visible(job_id, share_subs, share_clients, deleted_at)
  or (deleted_at is null and private.bid_sheet_visible(id)));

-- ... and the files attached to it
create or replace function private.bid_file_visible(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.record_attachments ra
                 where ra.file_id = p_file and ra.record_type = 'bid_package'
                   and private.bid_sub_request(ra.record_id) is not null);
$$;

alter policy files_select on public.files using (
  private.file_visible(org_id, job_id, share_subs, share_clients, uploaded_by, uploader_org, deleted_at)
  or (deleted_at is null and private.bid_file_visible(id)));

create or replace function private.can_see_file(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.file_visible(f.org_id, f.job_id, f.share_subs, f.share_clients, f.uploaded_by, f.uploader_org, f.deleted_at)
                          or (f.deleted_at is null and private.bid_file_visible(f.id))
                   from public.files f where f.id = p_file), false);
$$;

grant execute on all functions in schema private to authenticated;
