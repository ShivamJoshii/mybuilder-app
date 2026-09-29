-- =====================================================================
-- Warranty: claims (client-submitted or builder-entered), assignment to a
-- team member or sub, service appointments the sub confirms/completes,
-- and client feedback once resolved.
-- =====================================================================
create type public.claim_status as enum ('open', 'scheduled', 'resolved', 'closed');
create type public.appt_status as enum ('scheduled', 'confirmed', 'completed', 'missed', 'cancelled');

create table public.warranty_claims (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations (id) on delete cascade,
  job_id               uuid not null references public.jobs (id) on delete cascade,
  number               int not null,
  title                text not null check (length(trim(title)) between 1 and 200),
  description          text check (length(description) <= 8000),
  category             text check (length(category) <= 60),
  location             text check (length(location) <= 80),
  priority             text not null default 'normal' check (priority in ('low', 'normal', 'urgent')),
  status               public.claim_status not null default 'open',
  submitted_by_client  boolean not null default false,
  assignee_user_id     uuid references public.profiles (id) on delete set null,
  assignee_sub_org_id  uuid references public.organizations (id) on delete set null,
  resolved_at          timestamptz,
  client_rating        int check (client_rating between 1 and 5),
  client_feedback      text check (length(client_feedback) <= 4000),
  feedback_at          timestamptz,
  created_by           uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  unique (job_id, number)
);
create index warranty_claims_job on public.warranty_claims (job_id) where deleted_at is null;

-- Internal notes live apart from the claim so clients and subs never read them
create table public.warranty_claim_notes (
  claim_id        uuid primary key references public.warranty_claims (id) on delete cascade,
  internal_notes  text not null default '' check (length(internal_notes) <= 8000)
);

create table public.warranty_appointments (
  id                   uuid primary key default gen_random_uuid(),
  claim_id             uuid not null references public.warranty_claims (id) on delete cascade,
  starts_at            timestamptz not null,
  ends_at              timestamptz,
  assignee_user_id     uuid references public.profiles (id) on delete set null,
  assignee_sub_org_id  uuid references public.organizations (id) on delete set null,
  status               public.appt_status not null default 'scheduled',
  notes                text check (length(notes) <= 4000),
  work_notes           text check (length(work_notes) <= 4000),        -- what the tech did
  completed_at         timestamptz,
  created_by           uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at           timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index warranty_appts_claim on public.warranty_appointments (claim_id);

create or replace function private.claim_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select org_id into new.org_id from public.jobs where id = new.job_id;
    perform pg_advisory_xact_lock(hashtext('wc:' || new.job_id::text));
    select coalesce(max(number), 0) + 1 into new.number from public.warranty_claims where job_id = new.job_id;
    new.created_by := auth.uid(); new.status := 'open'; new.resolved_at := null;
    new.client_rating := null; new.client_feedback := null; new.feedback_at := null;
    new.submitted_by_client := not private.is_job_internal(new.job_id);
    if new.submitted_by_client then
      new.assignee_user_id := null; new.assignee_sub_org_id := null; new.priority := coalesce(new.priority, 'normal');
    end if;
  else
    new.org_id := old.org_id; new.job_id := old.job_id; new.number := old.number; new.created_by := old.created_by;
    new.submitted_by_client := old.submitted_by_client; new.created_at := old.created_at;
    if current_setting('app.claim_status', true) is distinct from 'on' then
      new.client_rating := old.client_rating; new.client_feedback := old.client_feedback; new.feedback_at := old.feedback_at;
      new.resolved_at := case when new.status in ('resolved', 'closed') then coalesce(old.resolved_at, now()) else null end;
    end if;
  end if;
  if new.assignee_sub_org_id is not null and not exists (select 1 from public.builder_sub_links where builder_org_id = new.org_id and sub_org_id = new.assignee_sub_org_id) then
    raise exception 'That sub is not linked to your company' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger warranty_claims_fill before insert or update on public.warranty_claims for each row execute function private.claim_fill();

create or replace function private.claim_row(p uuid)
returns public.warranty_claims language sql stable security definer set search_path = '' as $$ select * from public.warranty_claims where id = p $$;
create or replace function private.claim_sub_ok(p_claim uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.warranty_claims c where c.id = p_claim and c.deleted_at is null and (
      (c.assignee_sub_org_id is not null and private.is_my_linked_sub(c.org_id, c.assignee_sub_org_id))
   or exists (select 1 from public.warranty_appointments a where a.claim_id = c.id and a.assignee_sub_org_id is not null and private.is_my_linked_sub(c.org_id, a.assignee_sub_org_id))));
$$;
create or replace function private.claim_visible(p_id uuid, p_job uuid, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_module(p_job, 'warranties', 'view')
      or (p_deleted is null and private.is_job_client(p_job))
      or private.claim_sub_ok(p_id);
$$;
create or replace function public.can_see_claim(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.warranty_claims c where c.id = p and private.claim_visible(c.id, c.job_id, c.deleted_at));
$$;
grant execute on function private.claim_row(uuid), private.claim_sub_ok(uuid), private.claim_visible(uuid, uuid, timestamptz) to authenticated;

-- Sub (or builder) updates an appointment: confirm, complete with notes, or mark missed
create or replace function public.update_appointment(p_appt uuid, p_status public.appt_status, p_work_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.warranty_appointments; c public.warranty_claims; v_sub boolean;
begin
  select * into a from public.warranty_appointments where id = p_appt for update;
  select * into c from public.warranty_claims where id = a.claim_id;
  v_sub := a.assignee_sub_org_id is not null and private.is_my_linked_sub(c.org_id, a.assignee_sub_org_id);
  if a.id is null or not (v_sub or a.assignee_user_id = auth.uid() or private.can_module(c.job_id, 'warranties', 'edit')) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v_sub and p_status not in ('confirmed', 'completed') then raise exception 'Subs can confirm or complete appointments' using errcode = '22023'; end if;
  update public.warranty_appointments set status = p_status, work_notes = coalesce(p_work_notes, work_notes),
    completed_at = case when p_status = 'completed' then now() else completed_at end where id = p_appt;
  if p_status = 'completed' then
    perform private.notify(coalesce((select array_agg(user_id) from public.job_managers where job_id = c.job_id), '{}') || array[c.created_by],
      c.org_id, c.job_id, 'warranty.updated', 'Service completed: ' || c.title, p_work_notes, '/warranty/' || c.id);
  end if;
end $$;

-- Client feedback once resolved
create or replace function public.claim_feedback(p_claim uuid, p_rating int, p_feedback text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.warranty_claims;
begin
  select * into c from public.warranty_claims where id = p_claim for update;
  if c.id is null or not private.is_job_client(c.job_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if c.status not in ('resolved', 'closed') then raise exception 'You can leave feedback once the claim is resolved' using errcode = '22023'; end if;
  perform set_config('app.claim_status', 'on', true);
  update public.warranty_claims set client_rating = p_rating, client_feedback = p_feedback, feedback_at = now() where id = p_claim;
  perform set_config('app.claim_status', 'off', true);
  perform private.notify(coalesce((select array_agg(user_id) from public.job_managers where job_id = c.job_id), '{}') || array[c.created_by],
    c.org_id, c.job_id, 'warranty.updated', 'Client feedback on ' || c.title || ': ' || p_rating || '/5', p_feedback, '/warranty/' || c.id);
end $$;

insert into public.app_notification_types (key, grp, module, label, sort) values
  ('warranty.submitted', 'Project Management', 'Warranty', 'New warranty claim', 70),
  ('warranty.assigned', 'Project Management', 'Warranty', 'Warranty work assigned to you', 71),
  ('warranty.updated', 'Project Management', 'Warranty', 'Warranty claim updated', 72);

create or replace function private.ntf_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_users uuid[];
begin
  if tg_op = 'INSERT' and new.submitted_by_client then
    perform private.notify(coalesce((select array_agg(user_id) from public.job_managers where job_id = new.job_id), (select array[created_by] from public.jobs where id = new.job_id)),
      new.org_id, new.job_id, 'warranty.submitted', 'Warranty claim: ' || new.title, new.description, '/warranty/' || new.id);
  end if;
  if new.assignee_sub_org_id is not null and (tg_op = 'INSERT' or new.assignee_sub_org_id is distinct from old.assignee_sub_org_id) then
    perform private.notify(private.org_users(new.assignee_sub_org_id), new.org_id, new.job_id, 'warranty.assigned', 'Warranty work: ' || new.title, null, '/warranty/' || new.id);
  end if;
  if new.assignee_user_id is not null and (tg_op = 'INSERT' or new.assignee_user_id is distinct from old.assignee_user_id) then
    perform private.notify(array[new.assignee_user_id], new.org_id, new.job_id, 'warranty.assigned', 'Warranty work: ' || new.title, null, '/warranty/' || new.id);
  end if;
  if tg_op = 'UPDATE' and new.status = 'resolved' and old.status <> 'resolved' then
    perform private.notify((select coalesce(array_agg(user_id), '{}') from public.job_clients where job_id = new.job_id and user_id is not null),
      new.org_id, new.job_id, 'warranty.updated', 'Resolved: ' || new.title, 'Tell us how we did.', '/warranty/' || new.id);
  end if;
  return null;
end $$;
create trigger warranty_claims_ntf after insert or update on public.warranty_claims for each row execute function private.ntf_claim();

create or replace function private.ntf_appt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.warranty_claims; v_users uuid[];
begin
  select * into c from public.warranty_claims where id = new.claim_id;
  if tg_op = 'INSERT' then
    v_users := (select coalesce(array_agg(user_id), '{}') from public.job_clients where job_id = c.job_id and user_id is not null);
    if new.assignee_sub_org_id is not null then v_users := v_users || private.org_users(new.assignee_sub_org_id); end if;
    if new.assignee_user_id is not null then v_users := v_users || array[new.assignee_user_id]; end if;
    perform private.notify(v_users, c.org_id, c.job_id, 'warranty.updated', 'Service appointment for ' || c.title,
      to_char(new.starts_at at time zone 'America/Edmonton', 'Dy Mon DD, HH12:MI AM'), '/warranty/' || c.id);
    if c.status = 'open' then
      perform set_config('app.claim_status', 'on', true);
      update public.warranty_claims set status = 'scheduled' where id = c.id;
      perform set_config('app.claim_status', 'off', true);
    end if;
  end if;
  return null;
end $$;
create trigger warranty_appts_ntf after insert on public.warranty_appointments for each row execute function private.ntf_appt();

do $$ declare f text; begin
  foreach f in array array['can_see_claim(uuid)', 'update_appointment(uuid, public.appt_status, text)', 'claim_feedback(uuid, int, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

alter table public.warranty_claims enable row level security;
alter table public.warranty_appointments enable row level security;
alter table public.warranty_claim_notes enable row level security;
create policy claim_notes_all on public.warranty_claim_notes for all to authenticated
  using (private.can_module((private.claim_row(claim_id)).job_id, 'warranties', 'view'))
  with check (private.can_module((private.claim_row(claim_id)).job_id, 'warranties', 'edit'));

create policy claims_select on public.warranty_claims for select to authenticated using (private.claim_visible(id, job_id, deleted_at));
create policy claims_insert on public.warranty_claims for insert to authenticated
  with check (private.can_module(job_id, 'warranties', 'add')
           or (private.is_job_client(job_id) and coalesce(private.client_setting(job_id, 'submit_warranty_claims'), 'true'::jsonb) <> 'false'::jsonb));
create policy claims_update on public.warranty_claims for update to authenticated
  using (private.can_module(job_id, 'warranties', 'edit')) with check (private.can_module(job_id, 'warranties', 'edit'));

create policy appts_select on public.warranty_appointments for select to authenticated using (public.can_see_claim(claim_id));
create policy appts_write on public.warranty_appointments for all to authenticated
  using (private.can_module((private.claim_row(claim_id)).job_id, 'warranties', 'edit'))
  with check (private.can_module((private.claim_row(claim_id)).job_id, 'warranties', 'edit'));

revoke all on public.warranty_claims, public.warranty_appointments, public.warranty_claim_notes from anon;
