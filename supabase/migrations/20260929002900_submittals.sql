-- =====================================================================
-- Submittals: shop drawings, product data and samples, requested from a
-- sub, reviewed by the builder or architect, with numbered revisions and
-- a clear "ball in court".
-- =====================================================================
create type public.submittal_status as enum ('draft', 'requested', 'submitted', 'revise', 'approved', 'approved_as_noted', 'rejected', 'closed');

create table public.submittals (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations (id) on delete cascade,
  job_id                uuid not null references public.jobs (id) on delete cascade,
  number                int not null,
  title                 text not null check (length(trim(title)) between 1 and 200),
  spec_section          text check (length(spec_section) <= 60),
  kind                  text not null default 'product_data' check (kind in ('shop_drawing', 'product_data', 'sample', 'mock_up', 'other')),
  description           text check (length(description) <= 8000),
  submitter_sub_org_id  uuid references public.organizations (id) on delete set null,
  reviewer_user_id      uuid references public.profiles (id) on delete set null,
  due_date              date,
  required_on_site      date,
  status                public.submittal_status not null default 'draft',
  revision              int not null default 0,
  created_by            uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  unique (job_id, number)
);
create index submittals_job on public.submittals (job_id) where deleted_at is null;

create table public.submittal_revisions (
  id              uuid primary key default gen_random_uuid(),
  submittal_id    uuid not null references public.submittals (id) on delete cascade,
  revision        int not null,
  submitted_by    uuid references public.profiles (id) on delete set null,
  submitted_at    timestamptz not null default now(),
  notes           text check (length(notes) <= 8000),
  decision        text check (decision in ('approved', 'approved_as_noted', 'revise', 'rejected')),
  decision_notes  text check (length(decision_notes) <= 8000),
  decided_by      uuid references public.profiles (id) on delete set null,
  decided_at      timestamptz,
  unique (submittal_id, revision)
);

create or replace function private.submittal_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select org_id into new.org_id from public.jobs where id = new.job_id;
    perform pg_advisory_xact_lock(hashtext('sub:' || new.job_id::text));
    select coalesce(max(number), 0) + 1 into new.number from public.submittals where job_id = new.job_id;
    new.created_by := auth.uid(); new.status := 'draft'; new.revision := 0;
  else
    new.org_id := old.org_id; new.job_id := old.job_id; new.number := old.number; new.created_by := old.created_by;
    if current_setting('app.submittal_status', true) is distinct from 'on' then new.status := old.status; new.revision := old.revision; end if;
  end if;
  if new.submitter_sub_org_id is not null and not exists (select 1 from public.builder_sub_links where builder_org_id = new.org_id and sub_org_id = new.submitter_sub_org_id) then
    raise exception 'That sub is not linked to your company' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger submittals_fill before insert or update on public.submittals for each row execute function private.submittal_fill();

create or replace function private.submittal_row(p uuid)
returns public.submittals language sql stable security definer set search_path = '' as $$ select * from public.submittals where id = p $$;
create or replace function private.submittal_visible(p_org uuid, p_job uuid, p_sub uuid, p_reviewer uuid, p_status public.submittal_status, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_module(p_job, 'submittals', 'view') or (p_deleted is null and p_reviewer = auth.uid())
      or (p_deleted is null and p_status <> 'draft' and p_sub is not null and private.is_my_linked_sub(p_org, p_sub));
$$;
create or replace function public.can_see_submittal(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.submittals s where s.id = p and private.submittal_visible(s.org_id, s.job_id, s.submitter_sub_org_id, s.reviewer_user_id, s.status, s.deleted_at));
$$;
grant execute on function private.submittal_row(uuid), private.submittal_visible(uuid, uuid, uuid, uuid, public.submittal_status, timestamptz) to authenticated;

create or replace function private.set_submittal(p uuid, p_status public.submittal_status, p_revision int default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.submittal_status', 'on', true);
  update public.submittals set status = p_status, revision = coalesce(p_revision, revision) where id = p;
  perform set_config('app.submittal_status', 'off', true);
end $$;

-- Builder asks the sub for the submittal
create or replace function public.request_submittal(p uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.submittals;
begin
  select * into s from public.submittals where id = p for update;
  if s.id is null or not private.can_module(s.job_id, 'submittals', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if s.status <> 'draft' then raise exception 'Already requested' using errcode = '22023'; end if;
  if s.submitter_sub_org_id is null then raise exception 'Pick the sub who submits it' using errcode = '23514'; end if;
  perform private.set_submittal(p, 'requested');
  perform private.notify(private.org_users(s.submitter_sub_org_id), s.org_id, s.job_id, 'submittal.requested',
    'Submittal #' || s.number || ' requested: ' || s.title, case when s.due_date is not null then 'Due ' || to_char(s.due_date, 'Mon DD') end, '/submittals/' || s.id);
end $$;

-- Sub (or the builder for them) submits the next revision
create or replace function public.submit_submittal(p uuid, p_notes text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare s public.submittals; v_rev int;
begin
  select * into s from public.submittals where id = p for update;
  if s.id is null or not (private.is_my_linked_sub(s.org_id, s.submitter_sub_org_id) or private.can_module(s.job_id, 'submittals', 'edit')) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if s.status not in ('requested', 'revise', 'draft') then raise exception 'This submittal is not waiting on a submission' using errcode = '22023'; end if;
  v_rev := coalesce((select max(revision) + 1 from public.submittal_revisions where submittal_id = p), 0);
  insert into public.submittal_revisions (submittal_id, revision, submitted_by, notes) values (p, v_rev, auth.uid(), p_notes);
  perform private.set_submittal(p, 'submitted', v_rev);
  perform private.notify(coalesce(array[s.reviewer_user_id], '{}') || coalesce((select array_agg(user_id) from public.job_managers where job_id = s.job_id), '{}') || array[s.created_by],
    s.org_id, s.job_id, 'submittal.submitted', 'Submittal #' || s.number || ' rev ' || v_rev || ' ready for review', s.title, '/submittals/' || s.id);
  return v_rev;
end $$;

-- Reviewer's decision on the current revision
create or replace function public.review_submittal(p uuid, p_decision text, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.submittals;
begin
  select * into s from public.submittals where id = p for update;
  if s.id is null or not (s.reviewer_user_id = auth.uid() or private.can_module(s.job_id, 'submittals', 'edit')) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if s.status <> 'submitted' then raise exception 'Nothing to review' using errcode = '22023'; end if;
  if p_decision not in ('approved', 'approved_as_noted', 'revise', 'rejected') then raise exception 'Bad decision' using errcode = '22023'; end if;
  if p_decision in ('approved_as_noted', 'revise', 'rejected') and coalesce(trim(p_notes), '') = '' then raise exception 'Add review notes' using errcode = '23514'; end if;
  update public.submittal_revisions set decision = p_decision, decision_notes = p_notes, decided_by = auth.uid(), decided_at = now()
  where submittal_id = p and revision = s.revision;
  perform private.set_submittal(p, p_decision::public.submittal_status);
  if s.submitter_sub_org_id is not null then
    perform private.notify(private.org_users(s.submitter_sub_org_id), s.org_id, s.job_id, 'submittal.reviewed',
      'Submittal #' || s.number || ': ' || replace(p_decision, '_', ' '), p_notes, '/submittals/' || s.id);
  end if;
end $$;

do $$ declare f text; begin
  foreach f in array array['can_see_submittal(uuid)', 'request_submittal(uuid)', 'submit_submittal(uuid, text)', 'review_submittal(uuid, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

insert into public.app_notification_types (key, grp, module, label, sort) values
  ('submittal.requested', 'Project Management', 'Submittals', 'Submittal requested from you', 90),
  ('submittal.submitted', 'Project Management', 'Submittals', 'Submittal ready for review', 91),
  ('submittal.reviewed', 'Project Management', 'Submittals', 'Submittal reviewed', 92);

alter table public.submittals enable row level security;
alter table public.submittal_revisions enable row level security;
create policy submittals_select on public.submittals for select to authenticated
  using (private.submittal_visible(org_id, job_id, submitter_sub_org_id, reviewer_user_id, status, deleted_at));
create policy submittals_insert on public.submittals for insert to authenticated with check (private.can_module(job_id, 'submittals', 'add'));
create policy submittals_update on public.submittals for update to authenticated
  using (private.can_module(job_id, 'submittals', 'edit')) with check (private.can_module(job_id, 'submittals', 'edit'));
create policy sub_revs_select on public.submittal_revisions for select to authenticated using (public.can_see_submittal(submittal_id));
revoke all on public.submittals, public.submittal_revisions from anon;
