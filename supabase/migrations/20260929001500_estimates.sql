-- =====================================================================
-- Estimating: estimate per job (groups + line items), cost catalog,
-- proposals with built-in e-signature, send-to-budget.
-- Money rules:
--   builder_cost = quantity × unit_cost
--   client_price = builder_cost + markup (percent of cost, or a flat amount)
--   tax = client_price × tax_rate on taxable lines (GST/HST/PST by province)
-- Users need estimates.cost to see costs; price-only users read client
-- prices through estimate_price_lines().
-- =====================================================================

create type public.markup_type as enum ('percent', 'amount');
create type public.marked_as as enum ('none', 'allowance', 'bid', 'selection');
create type public.option_status as enum ('pending', 'approved', 'declined');
create type public.proposal_status as enum ('draft', 'released', 'approved', 'declined');

create table public.cost_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  cost_code_id  uuid references public.cost_codes (id) on delete set null,
  title         text not null check (length(trim(title)) between 1 and 200),
  description   text,
  unit          text not null default 'ea',
  unit_cost     numeric(14,4) not null default 0 check (unit_cost >= 0),
  cost_type     public.cost_type not null default 'material',
  markup_type   public.markup_type not null default 'percent',
  markup_value  numeric(14,4) not null default 0,
  taxable       boolean not null default true,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index cost_items_org on public.cost_items (org_id) where is_active;

create table public.estimates (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  job_id              uuid not null unique references public.jobs (id) on delete cascade,
  default_markup_pct  numeric(7,3) not null default 20,
  tax_rate            numeric(6,3) not null default 5,       -- percent
  tax_label           text not null default 'GST',
  locked_at           timestamptz,
  sent_to_budget_at   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger estimates_touch before update on public.estimates for each row execute function private.touch_updated_at();
create trigger estimates_fill before insert on public.estimates for each row execute function private.fill_org_from_job();

create table public.estimate_groups (
  id             uuid primary key default gen_random_uuid(),
  estimate_id    uuid not null references public.estimates (id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 120),
  sort           int not null default 0,
  is_optional    boolean not null default false,
  option_status  public.option_status not null default 'pending'
);
create index estimate_groups_est on public.estimate_groups (estimate_id, sort);

create table public.estimate_items (
  id              uuid primary key default gen_random_uuid(),
  estimate_id     uuid not null references public.estimates (id) on delete cascade,
  group_id        uuid references public.estimate_groups (id) on delete set null,
  cost_code_id    uuid references public.cost_codes (id) on delete set null,
  cost_type       public.cost_type not null default 'material',
  title           text not null check (length(trim(title)) between 1 and 200),
  description     text check (length(description) <= 4000),
  internal_notes  text check (length(internal_notes) <= 4000),
  quantity        numeric(14,4) not null default 1,
  unit            text not null default 'ea',
  unit_cost       numeric(14,4) not null default 0 check (unit_cost >= 0),
  markup_type     public.markup_type not null default 'percent',
  markup_value    numeric(14,4) not null default 0,
  taxable         boolean not null default true,
  marked_as       public.marked_as not null default 'none',
  sort            int not null default 0,
  created_at      timestamptz not null default now()
);
create index estimate_items_est on public.estimate_items (estimate_id, group_id, sort);

-- Computed money (one source of truth for the app, proposals and budget)
create or replace function public.item_cost(i public.estimate_items)
returns numeric language sql immutable set search_path = '' as $$ select round(i.quantity * i.unit_cost, 2) $$;
create or replace function public.item_price(i public.estimate_items)
returns numeric language sql immutable set search_path = '' as $$
  select round(i.quantity * i.unit_cost + case when i.markup_type = 'percent' then i.quantity * i.unit_cost * i.markup_value / 100 else i.markup_value end, 2)
$$;

create table public.proposals (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  job_id             uuid not null references public.jobs (id) on delete cascade,
  estimate_id        uuid not null references public.estimates (id) on delete cascade,
  title              text not null check (length(trim(title)) between 1 and 200),
  intro              text,
  closing            text,
  approval_deadline  date,
  collect_signature  boolean not null default true,
  show_line_items    boolean not null default true,
  show_quantities    boolean not null default true,
  status             public.proposal_status not null default 'draft',
  snapshot           jsonb,         -- frozen groups/lines/prices at release (what the client signs)
  subtotal           numeric(14,2),
  tax                numeric(14,2),
  total              numeric(14,2),
  created_by         uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at         timestamptz not null default now(),
  released_at        timestamptz,
  decided_at         timestamptz
);
create index proposals_job on public.proposals (job_id);
create trigger proposals_fill before insert on public.proposals for each row execute function private.fill_org_from_job();

create table public.proposal_signatures (
  id              uuid primary key default gen_random_uuid(),
  proposal_id     uuid not null references public.proposals (id) on delete cascade,
  decision        text not null check (decision in ('approved', 'declined')),
  signer_name     text not null check (length(trim(signer_name)) between 1 and 120),
  signer_user_id  uuid references public.profiles (id) on delete set null,
  on_behalf       boolean not null default false,      -- builder recorded the client's decision
  signature       text,                                -- typed name or drawn signature (data URL)
  comment         text,
  ip              text,
  user_agent      text,
  signed_at       timestamptz not null default now()
);

create table public.budget_lines (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  job_id          uuid not null references public.jobs (id) on delete cascade,
  cost_code_id    uuid references public.cost_codes (id) on delete set null,
  cost_type       public.cost_type not null,
  original_cost   numeric(14,2) not null default 0,
  original_price  numeric(14,2) not null default 0,
  source          text not null default 'estimate',
  created_at      timestamptz not null default now()
);
create index budget_lines_job on public.budget_lines (job_id);

-- Lock guard: a locked estimate cannot change
create or replace function private.estimate_unlocked(p_estimate uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select locked_at is null from public.estimates where id = p_estimate;
$$;
create or replace function private.estimate_job(p_estimate uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select job_id from public.estimates where id = p_estimate;
$$;
grant execute on function private.estimate_unlocked(uuid), private.estimate_job(uuid) to authenticated;

-- Price-only view of an estimate (for roles with estimates.price but not cost)
create or replace function public.estimate_price_lines(p_estimate uuid)
returns table (id uuid, group_id uuid, title text, description text, quantity numeric, unit text, price numeric, taxable boolean, sort int)
language sql stable security definer set search_path = '' as $$
  select i.id, i.group_id, i.title, i.description, i.quantity, i.unit, public.item_price(i), i.taxable, i.sort
  from public.estimate_items i join public.estimates e on e.id = i.estimate_id
  where i.estimate_id = p_estimate and private.can_module(e.job_id, 'estimates', 'view') and private.has_perm(e.org_id, 'estimates', 'price')
  order by i.sort;
$$;

-- Release a proposal: freeze the estimate into a snapshot the client signs
create or replace function public.release_proposal(p_proposal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.proposals; e public.estimates; v_snap jsonb; v_sub numeric; v_tax numeric;
begin
  select * into p from public.proposals where id = p_proposal for update;
  if p.id is null or not private.can_module(p.job_id, 'proposals', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.status <> 'draft' then raise exception 'Only drafts can be released' using errcode = '22023'; end if;
  select * into e from public.estimates where id = p.estimate_id;
  select jsonb_agg(g order by g.sort) into v_snap from (
    select coalesce(gr.id::text, 'ungrouped') id, coalesce(gr.name, 'Items') name, coalesce(gr.sort, 99999) sort,
           coalesce(gr.is_optional, false) optional,
           jsonb_agg(jsonb_build_object('title', i.title, 'description', i.description, 'quantity', i.quantity, 'unit', i.unit,
                                        'price', public.item_price(i), 'taxable', i.taxable) order by i.sort) lines,
           sum(public.item_price(i)) total
    from public.estimate_items i left join public.estimate_groups gr on gr.id = i.group_id
    where i.estimate_id = e.id and (gr.id is null or not gr.is_optional or gr.option_status <> 'declined')
    group by gr.id, gr.name, gr.sort, gr.is_optional) g;
  select coalesce(sum(public.item_price(i)), 0), coalesce(sum(case when i.taxable then public.item_price(i) end), 0) * e.tax_rate / 100
    into v_sub, v_tax
  from public.estimate_items i left join public.estimate_groups gr on gr.id = i.group_id
  where i.estimate_id = e.id and (gr.id is null or not gr.is_optional);
  update public.proposals set status = 'released', released_at = now(), snapshot = coalesce(v_snap, '[]'::jsonb),
    subtotal = round(v_sub, 2), tax = round(v_tax, 2), total = round(v_sub + v_tax, 2)
  where id = p_proposal;
  -- tell the clients
  perform private.notify((select coalesce(array_agg(user_id), '{}') from public.job_clients where job_id = p.job_id and user_id is not null),
    p.org_id, p.job_id, 'proposal.released', 'Proposal ready for your review: ' || p.title, null, '/proposals/' || p.id);
end $$;

-- Client (or builder on their behalf) approves / declines with a signature
create or replace function public.decide_proposal(p_proposal uuid, p_decision text, p_signer_name text, p_signature text, p_comment text default null, p_ip text default null, p_ua text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.proposals; v_behalf boolean;
begin
  select * into p from public.proposals where id = p_proposal for update;
  if p.id is null then raise exception 'Not found' using errcode = 'P0002'; end if;
  if p.status <> 'released' then raise exception 'This proposal is not open for approval' using errcode = '22023'; end if;
  if p_decision not in ('approved', 'declined') then raise exception 'Bad decision' using errcode = '22023'; end if;
  if private.is_job_client(p.job_id) then v_behalf := false;
  elsif private.can_module(p.job_id, 'proposals', 'edit') then v_behalf := true;
  else raise exception 'Not allowed' using errcode = '42501'; end if;
  if p.collect_signature and p_decision = 'approved' and coalesce(trim(p_signature), '') = '' then
    raise exception 'A signature is required' using errcode = '23514';
  end if;
  insert into public.proposal_signatures (proposal_id, decision, signer_name, signer_user_id, on_behalf, signature, comment, ip, user_agent)
  values (p_proposal, p_decision, trim(p_signer_name), auth.uid(), v_behalf, p_signature, p_comment, p_ip, p_ua);
  update public.proposals set status = p_decision::public.proposal_status, decided_at = now() where id = p_proposal;
  perform private.notify((select coalesce(array_agg(user_id), '{}') from public.job_managers where job_id = p.job_id) || array[p.created_by],
    p.org_id, p.job_id, 'proposal.decided', 'Proposal ' || p_decision || ': ' || p.title, p_comment, '/proposals/' || p.id);
end $$;

-- Lock the estimate and write the original budget (needs an approved proposal)
create or replace function public.send_estimate_to_budget(p_estimate uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.estimates;
begin
  select * into e from public.estimates where id = p_estimate for update;
  if e.id is null or not private.can_module(e.job_id, 'estimates', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if e.sent_to_budget_at is not null then raise exception 'Already sent to budget' using errcode = '23505'; end if;
  if not exists (select 1 from public.proposals where estimate_id = e.id and status = 'approved') then
    raise exception 'The client has to approve a proposal first' using errcode = '22023';
  end if;
  insert into public.budget_lines (org_id, job_id, cost_code_id, cost_type, original_cost, original_price)
  select e.org_id, e.job_id, i.cost_code_id, i.cost_type, sum(public.item_cost(i)), sum(public.item_price(i))
  from public.estimate_items i left join public.estimate_groups g on g.id = i.group_id
  where i.estimate_id = e.id and (g.id is null or not g.is_optional or g.option_status = 'approved')
  group by i.cost_code_id, i.cost_type;
  update public.estimates set locked_at = now(), sent_to_budget_at = now() where id = e.id;
  update public.job_private set contract_price = (select sum(original_price) from public.budget_lines where job_id = e.job_id) where job_id = e.job_id;
end $$;

create or replace function public.unlock_estimate(p_estimate uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.estimates;
begin
  select * into e from public.estimates where id = p_estimate for update;
  if e.id is null or not private.can_module(e.job_id, 'estimates', 'edit') then raise exception 'Not allowed' using errcode = '42501'; end if;
  delete from public.budget_lines where job_id = e.job_id and source = 'estimate';
  update public.estimates set locked_at = null, sent_to_budget_at = null where id = e.id;
end $$;

do $$ declare f text; begin
  foreach f in array array['estimate_price_lines(uuid)', 'release_proposal(uuid)', 'decide_proposal(uuid, text, text, text, text, text, text)', 'send_estimate_to_budget(uuid)', 'unlock_estimate(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

insert into public.app_notification_types (key, grp, module, label, sort) values
  ('proposal.released', 'Sales', 'Proposals', 'Proposal ready for review', 3),
  ('proposal.decided', 'Sales', 'Proposals', 'Proposal approved or declined', 4);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.cost_items enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_groups enable row level security;
alter table public.estimate_items enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_signatures enable row level security;
alter table public.budget_lines enable row level security;

create policy cost_items_select on public.cost_items for select to authenticated using (private.is_member(org_id) and private.has_perm(org_id, 'estimates', 'cost'));
create policy cost_items_write on public.cost_items for all to authenticated
  using (private.has_perm(org_id, 'cost_codes', 'edit') or private.has_perm(org_id, 'estimates', 'edit'))
  with check (private.has_perm(org_id, 'cost_codes', 'add') or private.has_perm(org_id, 'estimates', 'add'));

create policy estimates_select on public.estimates for select to authenticated using (private.can_module(job_id, 'estimates', 'view'));
create policy estimates_insert on public.estimates for insert to authenticated with check (private.can_module(job_id, 'estimates', 'add'));
create policy estimates_update on public.estimates for update to authenticated
  using (private.can_module(job_id, 'estimates', 'edit') and locked_at is null) with check (private.can_module(job_id, 'estimates', 'edit'));

create policy groups_select on public.estimate_groups for select to authenticated using (private.can_module(private.estimate_job(estimate_id), 'estimates', 'view'));
create policy groups_write on public.estimate_groups for all to authenticated
  using (private.can_module(private.estimate_job(estimate_id), 'estimates', 'edit') and private.estimate_unlocked(estimate_id))
  with check (private.can_module(private.estimate_job(estimate_id), 'estimates', 'edit') and private.estimate_unlocked(estimate_id));

create policy items_select on public.estimate_items for select to authenticated
  using (private.can_module(private.estimate_job(estimate_id), 'estimates', 'view') and private.has_perm(private.job_org(private.estimate_job(estimate_id)), 'estimates', 'cost'));
create policy items_write on public.estimate_items for all to authenticated
  using (private.can_module(private.estimate_job(estimate_id), 'estimates', 'edit') and private.estimate_unlocked(estimate_id))
  with check (private.can_module(private.estimate_job(estimate_id), 'estimates', 'edit') and private.estimate_unlocked(estimate_id));

create policy proposals_select on public.proposals for select to authenticated
  using (private.can_module(job_id, 'proposals', 'view') or private.can_module(job_id, 'estimates', 'view')
      or (private.is_job_client(job_id) and status <> 'draft'));
create policy proposals_insert on public.proposals for insert to authenticated
  with check (created_by = (select auth.uid()) and (private.can_module(job_id, 'proposals', 'add') or private.can_module(job_id, 'estimates', 'add')));
create policy proposals_update on public.proposals for update to authenticated
  using (status = 'draft' and (private.can_module(job_id, 'proposals', 'edit') or private.can_module(job_id, 'estimates', 'edit')))
  with check (status = 'draft');

create policy signatures_select on public.proposal_signatures for select to authenticated
  using (exists (select 1 from public.proposals p where p.id = proposal_id));

create policy budget_select on public.budget_lines for select to authenticated using (private.can_module(job_id, 'budget', 'view') or private.can_module(job_id, 'estimates', 'view'));

revoke all on public.cost_items, public.estimates, public.estimate_groups, public.estimate_items, public.proposals,
  public.proposal_signatures, public.budget_lines from anon;
